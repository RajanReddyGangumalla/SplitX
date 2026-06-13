import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import '../styles/ExpenseDetail.css';

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

export default function ExpenseDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [expense, setExpense] = useState(null);
  const [splits, setSplits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    async function loadExpense() {
      try {
        setLoading(true);
        setError('');

        const response = await api.get(`/expenses/${id}/breakdown`);
        setExpense(response.data.expense);
        setSplits(response.data.splits || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load expense details');
      } finally {
        setLoading(false);
      }
    }

    loadExpense();
  }, [id, navigate]);

  if (loading) {
    return <div className="expense-shell loading">Loading expense...</div>;
  }

  if (error) {
    return (
      <div className="expense-shell">
        <div className="expense-error">{error}</div>
      </div>
    );
  }

  return (
    <div className="expense-shell">
      <header className="expense-header">
        <div>
          <p className="eyebrow">Expense</p>
          <h1>{expense?.description}</h1>
          <p className="subtext">
            {expense?.groupName} · {formatDate(expense?.expenseDate)}
          </p>
        </div>
        <Link to={`/groups/${expense?.groupId}`} className="back-link">
          Back to Group
        </Link>
      </header>

      <main className="expense-grid">
        <section className="detail-card">
          <div className="detail-row">
            <span>Amount</span>
            <strong>{formatCurrency(expense?.amount)}</strong>
          </div>
          <div className="detail-row">
            <span>Paid by</span>
            <strong>{expense?.paidBy?.name}</strong>
          </div>
          <div className="detail-row">
            <span>Split type</span>
            <strong>{expense?.splitType}</strong>
          </div>
          <div className="detail-row">
            <span>Original amount</span>
            <strong>
              {expense?.originalAmount ? `${expense.originalCurrency || 'INR'} ${expense.originalAmount}` : '—'}
            </strong>
          </div>
          <div className="detail-row">
            <span>Exchange rate</span>
            <strong>{expense?.exchangeRate || '—'}</strong>
          </div>
        </section>

        <section className="detail-card wide">
          <div className="panel-heading">
            <h2>Split Breakdown</h2>
            <span>{splits.length} members</span>
          </div>
          {splits.length === 0 ? (
            <p className="empty-state">No splits found.</p>
          ) : (
            <div className="split-table">
              <div className="split-table-header">
                <span>Name</span>
                <span>Email</span>
                <span>Amount Owed</span>
              </div>
              {splits.map((split) => (
                <div key={split.splitId} className="split-table-row">
                  <span>{split.userName}</span>
                  <span>{split.userEmail}</span>
                  <strong>{formatCurrency(split.amountOwed)}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
