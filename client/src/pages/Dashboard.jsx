import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import '../styles/Dashboard.css';

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [balanceSummary, setBalanceSummary] = useState({
    totalOwes: 0,
    totalIsOwed: 0,
    netBalance: 0
  });
  const [groupBreakdown, setGroupBreakdown] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');

    if (!token) {
      navigate('/login');
      return;
    }

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    async function loadDashboard() {
      try {
        setLoading(true);
        setError('');

        const [groupsResponse, balancesResponse] = await Promise.all([
          api.get('/groups'),
          api.get('/users/me/balances')
        ]);

        setGroups(groupsResponse.data.groups || []);
        setBalanceSummary(balancesResponse.data.summary || {
          totalOwes: 0,
          totalIsOwed: 0,
          netBalance: 0
        });
        setGroupBreakdown(balancesResponse.data.groupBreakdown || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }

    loadDashboard();
  }, [navigate]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  return (
    <div className="dashboard-shell">
      <header className="dashboard-header">
        <div>
          <p className="eyebrow">SplitX</p>
          <h1>Dashboard</h1>
          <p className="subtext">
            {user ? `Welcome back, ${user.name}` : 'Track groups and balances in one place'}
          </p>
        </div>
        <button className="logout-btn" onClick={handleLogout} type="button">
          Logout
        </button>
      </header>

      {error && <div className="dashboard-alert">{error}</div>}
      {loading ? (
        <div className="loading-state">Loading dashboard...</div>
      ) : (
        <main className="dashboard-grid">
          <section className="summary-card summary-highlight">
            <h2>Overall Balance</h2>
            <div className="summary-values">
              <div>
                <span>You owe</span>
                <strong>{formatCurrency(balanceSummary.totalOwes)}</strong>
              </div>
              <div>
                <span>You're owed</span>
                <strong>{formatCurrency(balanceSummary.totalIsOwed)}</strong>
              </div>
              <div>
                <span>Net balance</span>
                <strong className={balanceSummary.netBalance >= 0 ? 'positive' : 'negative'}>
                  {formatCurrency(balanceSummary.netBalance)}
                </strong>
              </div>
            </div>
          </section>

          <section className="summary-card">
            <div className="section-heading">
              <h2>My Groups</h2>
              <span>{groups.length} total</span>
            </div>
            {groups.length === 0 ? (
              <p className="empty-state">You are not in any groups yet.</p>
            ) : (
              <div className="group-list">
                {groups.map((group) => (
                  <Link key={group.id} to={`/groups/${group.id}`} className="group-item">
                    <div>
                      <h3>{group.name}</h3>
                      <p>{group.activeMembers} active members</p>
                    </div>
                    <span className="group-role">{group.role}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          <section className="summary-card">
            <div className="section-heading">
              <h2>Per Group Balance</h2>
              <span>Net position</span>
            </div>
            {groupBreakdown.length === 0 ? (
              <p className="empty-state">No balance data available yet.</p>
            ) : (
              <div className="breakdown-list">
                {groupBreakdown.map((group) => (
                  <div key={group.groupId} className="breakdown-item">
                    <div>
                      <h3>{group.groupName}</h3>
                      <p>
                        Owes {formatCurrency(group.owes)} · Owed {formatCurrency(group.isOwed)}
                      </p>
                    </div>
                    <strong className={group.net >= 0 ? 'positive' : 'negative'}>
                      {formatCurrency(group.net)}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  );
}
