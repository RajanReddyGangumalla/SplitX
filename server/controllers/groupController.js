const crypto = require('crypto');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

function formatGroup(group) {
  return {
    id: group.id,
    name: group.name,
    createdAt: group.createdAt,
    members: group.members.map((member) => ({
      id: member.id,
      role: member.role,
      joinedAt: member.joinedAt,
      leftAt: member.leftAt,
      user: {
        id: member.user.id,
        name: member.user.name,
        email: member.user.email
      }
    }))
  };
}

async function createGroup(req, res) {
  try {
    const { name } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Group name is required' });
    }

    const group = await prisma.group.create({
      data: {
        name: name.trim(),
        members: {
          create: {
            userId: req.user.id,
            role: 'admin',
            joinedAt: new Date()
          }
        }
      },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    return res.status(201).json({
      message: 'Group created successfully',
      group: formatGroup(group)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to create group' });
  }
}

async function getMyGroups(req, res) {
  try {
    const memberships = await prisma.groupMember.findMany({
      where: {
        userId: req.user.id,
        leftAt: null
      },
      include: {
        group: {
          include: {
            members: {
              where: {
                leftAt: null
              },
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true
                  }
                }
              }
            }
          }
        }
      },
      orderBy: {
        joinedAt: 'desc'
      }
    });

    return res.status(200).json({
      groups: memberships.map((membership) => ({
        id: membership.group.id,
        name: membership.group.name,
        createdAt: membership.group.createdAt,
        role: membership.role,
        joinedAt: membership.joinedAt,
        activeMembers: membership.group.members.length
      }))
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load groups' });
  }
}

async function getGroupById(req, res) {
  try {
    const { id } = req.params;

    const membership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.user.id,
          groupId: id
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    if (membership.leftAt !== null) {
      return res.status(403).json({ message: 'You have left this group' });
    }

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          where: {
            leftAt: null
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    return res.status(200).json({
      group: formatGroup(group)
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load group details' });
  }
}

async function addMemberByEmail(req, res) {
  try {
    const { id } = req.params;
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const currentMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.user.id,
          groupId: id
        }
      }
    });

    if (!currentMembership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    if (currentMembership.leftAt !== null) {
      return res.status(403).json({ message: 'You have left this group' });
    }

    if (currentMembership.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can add members' });
    }

    const group = await prisma.group.findUnique({
      where: { id }
    });

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    let user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    });

    if (!user) {
      const generatedPassword = crypto.randomBytes(16).toString('hex');
      const baseName = normalizedEmail.split('@')[0];
      let userName = baseName;
      let counter = 1;

      while (await prisma.user.findUnique({ where: { name: userName } })) {
        userName = `${baseName}${counter}`;
        counter++;
      }

      user = await prisma.user.create({
        data: {
          name: userName,
          email: normalizedEmail,
          password: generatedPassword
        }
      });
    }

    const existingMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: user.id,
          groupId: id
        }
      }
    });

    if (existingMembership) {
      if (existingMembership.leftAt === null) {
        return res.status(409).json({ message: 'User is already an active member of this group' });
      } else {
        await prisma.groupMember.update({
          where: {
            userId_groupId: {
              userId: user.id,
              groupId: id
            }
          },
          data: {
            leftAt: null,
            joinedAt: new Date()
          }
        });

        return res.status(201).json({
          message: 'Member re-added to group',
          action: 'rejoined'
        });
      }
    }

    const member = await prisma.groupMember.create({
      data: {
        userId: user.id,
        groupId: id,
        role: 'member',
        joinedAt: new Date()
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    return res.status(201).json({
      message: 'Member added successfully',
      member: {
        id: member.id,
        role: member.role,
        joinedAt: member.joinedAt,
        user: member.user
      }
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to add member' });
  }
}

async function removeMember(req, res) {
  try {
    const { id, userId } = req.params;

    const currentMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId: req.user.id,
          groupId: id
        }
      }
    });

    if (!currentMembership) {
      return res.status(403).json({ message: 'You are not a member of this group' });
    }

    if (currentMembership.leftAt !== null) {
      return res.status(403).json({ message: 'You have left this group' });
    }

    if (currentMembership.role !== 'admin') {
      return res.status(403).json({ message: 'Only admins can remove members' });
    }

    const targetMembership = await prisma.groupMember.findUnique({
      where: {
        userId_groupId: {
          userId,
          groupId: id
        }
      }
    });

    if (!targetMembership) {
      return res.status(404).json({ message: 'Member not found in this group' });
    }

    if (targetMembership.leftAt !== null) {
      return res.status(410).json({ message: 'User has already left this group' });
    }

    await prisma.groupMember.update({
      where: {
        userId_groupId: {
          userId,
          groupId: id
        }
      },
      data: {
        leftAt: new Date()
      }
    });

    return res.status(200).json({
      message: 'Member removed from group'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to remove member' });
  }
}

module.exports = {
  createGroup,
  getMyGroups,
  getGroupById,
  addMemberByEmail,
  removeMember
};
