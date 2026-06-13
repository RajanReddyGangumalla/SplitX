import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import '../styles/GroupDetail.css';

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Date(dateString).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default function GroupDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [balances, setBalances] = useState([]);
  const [summary, setSummary] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    async function loadGroup() {
      try {
        setLoading(true);
        setError('');

        const [groupResponse, balancesResponse] = await Promise.all([
          api.get(`/groups/${id}`),
          api.get(`/groups/${id}/balances`)
        ]);

        setGroup(groupResponse.data.group);
        setExpenses(groupResponse.data.expenses || []);
        setBalances(balancesResponse.data.balances || []);
        setSummary(balancesResponse.data.summary || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load group details');
      } finally {
        setLoading(false);
      }
    }

    loadGroup();
  }, [id, navigate]);

  if (loading) {
    return <div className="group-shell loading">Loading group...</div>;
  }

  if (error) {
    return (
      <div className="group-shell">
        <div className="group-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="group-shell">
      <header className="group-header">
        <div>
          <p className="eyebrow">Group</p>
          <h1>{group?.name}</h1>
          <p className="subtext">Active members, expenses, and balances</p>
        </div>
        <div className="group-actions">
          <Link to={`/groups/${id}/expenses/new`} className="action-btn primary">Add Expense</Link>
          <Link to="/settle" className="action-btn">Record Settlement</Link>
          <Link to="/import" className="action-btn">Import CSV</Link>
        </div>
      </header>

      <main className="group-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Active Members</h2>
            <span>{group?.members?.length || 0}</span>
          </div>
          <div className="member-list">
            {group?.members?.map((member) => (
              <div key={member.id} className="member-item">
                <div>
                  <h3>{member.user.name}</h3>
                  <p>{member.user.email}</p>
                </div>
                <span className="member-role">{member.role}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <h2>Group Balances</h2>
            <span>{balances.length} pairs</span>
          </div>
          {balances.length === 0 ? (
            <p className="empty-state">No balances yet.</p>
          ) : (
            <div className="balance-list">
              {balances.map((balance, index) => (
                <div key={`${balance.from}-${balance.to}-${index}`} className="balance-item">
                  <span>{balance.from}</span>
                  <strong>owes</strong>
                  <span>{balance.to}</span>
                  <strong className="negative">{formatCurrency(balance.amount)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel wide">
          <div className="panel-heading">
            <h2>Expenses</h2>
            <span>{expenses.length}</span>
          </div>
          {expenses.length === 0 ? (
            <p className="empty-state">No expenses in this group yet.</p>
          ) : (
            <div className="expense-list">
              {expenses.map((expense) => (
                <Link key={expense.id} to={`/expenses/${expense.id}`} className="expense-item">
                  <div>
                    <h3>{expense.description}</h3>
                    <p>
                      {formatDate(expense.expenseDate)} · Paid by {expense.paidBy.name}
                    </p>
                  </div>
                  <div className="expense-meta">
                    <strong>{formatCurrency(expense.amount)}</strong>
                    <span>{expense.splitType}</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="panel wide">
          <div className="panel-heading">
            <h2>Per Person Summary</h2>
            <span>Net position</span>
          </div>
          <div className="summary-table">
            {summary.map((person) => (
              <div key={person.userId} className="summary-row">
                <span>{person.name}</span>
                <span>Owes {formatCurrency(person.owes)}</span>
                <span>Owed {formatCurrency(person.isOwed)}</span>
                <strong className={person.net >= 0 ? 'positive' : 'negative'}>
                  {formatCurrency(person.net)}
                </strong>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
