import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [balanceSummary, setBalanceSummary] = useState({ totalOwes: 0, totalIsOwed: 0, netBalance: 0 });
  const [groupBreakdown, setGroupBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (!token) { navigate('/login'); return; }
    if (storedUser) setUser(JSON.parse(storedUser));
    loadDashboard();
  }, [navigate]);

  async function loadDashboard() {
    try {
      setLoading(true);
      const [groupsRes, balancesRes] = await Promise.all([
        api.get('/groups'),
        api.get('/users/me/balances')
      ]);
      setGroups(groupsRes.data.groups || []);
      setBalanceSummary(balancesRes.data.summary || { totalOwes: 0, totalIsOwed: 0, netBalance: 0 });
      setGroupBreakdown(balancesRes.data.groupBreakdown || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateGroup(e) {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    try {
      setCreating(true);
      await api.post('/groups', { name: newGroupName.trim() });
      setNewGroupName('');
      setShowCreateGroup(false);
      loadDashboard();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  }

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 24, fontFamily: 'sans-serif' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0 }}>SplitX Dashboard</h1>
          <p style={{ margin: 0, color: '#666' }}>Welcome back, {user?.name}</p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => navigate('/import')}
            style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            📂 Import CSV
          </button>
          <button onClick={() => navigate('/settle')}
            style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            💸 Settle Debt
          </button>
          <button onClick={handleLogout}
            style={{ padding: '8px 16px', background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>

      {error && <div style={{ background: '#fee2e2', padding: 12, borderRadius: 8, marginBottom: 16, color: '#dc2626' }}>{error}</div>}

      {/* Balance Summary */}
      <div style={{ background: '#1e293b', color: 'white', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 16px' }}>Overall Balance</h2>
        <div style={{ display: 'flex', gap: 32 }}>
          <div><p style={{ margin: 0, color: '#94a3b8' }}>You owe</p><h3 style={{ margin: 0, color: '#ef4444' }}>{formatCurrency(balanceSummary.totalOwes)}</h3></div>
          <div><p style={{ margin: 0, color: '#94a3b8' }}>You're owed</p><h3 style={{ margin: 0, color: '#10b981' }}>{formatCurrency(balanceSummary.totalIsOwed)}</h3></div>
          <div><p style={{ margin: 0, color: '#94a3b8' }}>Net balance</p><h3 style={{ margin: 0, color: balanceSummary.netBalance >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(balanceSummary.netBalance)}</h3></div>
        </div>
      </div>

      {/* Groups Section */}
      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ margin: 0 }}>My Groups ({groups.length})</h2>
          <button onClick={() => setShowCreateGroup(!showCreateGroup)}
            style={{ padding: '8px 16px', background: '#6366f1', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
            + Create Group
          </button>
        </div>

        {showCreateGroup && (
          <form onSubmit={handleCreateGroup} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
            <input
              type="text"
              placeholder="Group name e.g. Flat Expenses"
              value={newGroupName}
              onChange={e => setNewGroupName(e.target.value)}
              style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8 }}
            />
            <button type="submit" disabled={creating}
              style={{ padding: '8px 16px', background: '#10b981', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              {creating ? 'Creating...' : 'Create'}
            </button>
            <button type="button" onClick={() => setShowCreateGroup(false)}
              style={{ padding: '8px 16px', background: '#e2e8f0', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
              Cancel
            </button>
          </form>
        )}

        {loading ? <p>Loading...</p> : groups.length === 0 ? (
          <p style={{ color: '#94a3b8', textAlign: 'center', padding: 24 }}>No groups yet. Create one to get started!</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups.map(group => (
              <Link key={group.id} to={`/groups/${group.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: '#f8fafc', borderRadius: 8, textDecoration: 'none', color: 'inherit', border: '1px solid #e2e8f0' }}>
                <div>
                  <h3 style={{ margin: 0 }}>{group.name}</h3>
                  <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>{group.activeMembers} members · {group.role}</p>
                </div>
                <span style={{ color: '#6366f1' }}>→</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Per Group Balance */}
      {groupBreakdown.length > 0 && (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 12, padding: 24 }}>
          <h2 style={{ margin: '0 0 16px' }}>Per Group Balance</h2>
          {groupBreakdown.map(group => (
            <div key={group.groupId} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div>
                <h3 style={{ margin: 0 }}>{group.groupName}</h3>
                <p style={{ margin: 0, color: '#64748b', fontSize: 14 }}>Owes {formatCurrency(group.owes)} · Owed {formatCurrency(group.isOwed)}</p>
              </div>
              <strong style={{ color: group.net >= 0 ? '#10b981' : '#ef4444' }}>{formatCurrency(group.net)}</strong>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
