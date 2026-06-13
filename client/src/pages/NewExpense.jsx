import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api/axios';
import '../styles/NewExpense.css';

const SPLIT_TYPES = ['equal', 'unequal', 'percentage', 'share'];

function formatCurrency(amount) {
  const value = Number(amount || 0);
  return `₹${value.toFixed(2)}`;
}

function getTodayValue() {
  return new Date().toISOString().slice(0, 10);
}

function createMemberRows(members = []) {
  return members.map((member) => ({
    userId: member.user.id,
    name: member.user.name,
    email: member.user.email,
    value: ''
  }));
}

function sumValues(rows) {
  return rows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
}

export default function NewExpense() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [group, setGroup] = useState(null);
  const [members, setMembers] = useState([]);
  const [splitType, setSplitType] = useState('equal');
  const [form, setForm] = useState({
    description: '',
    expenseDate: getTodayValue(),
    amount: '',
    currency: 'INR',
    exchangeRate: 83
  });
  const [memberRows, setMemberRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

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

        const response = await api.get(`/groups/${id}`);
        const loadedGroup = response.data.group;
        const activeMembers = loadedGroup?.members || [];

        setGroup(loadedGroup);
        setMembers(activeMembers);
        setMemberRows(createMemberRows(activeMembers));
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load group details');
      } finally {
        setLoading(false);
      }
    }

    loadGroup();
  }, [id, navigate]);

  const selectedMemberRows = useMemo(() => {
    return memberRows.filter((row) => row.userId);
  }, [memberRows]);

  const runningTotal = useMemo(() => {
    if (splitType === 'equal') {
      return Number(form.amount || 0);
    }

    return sumValues(selectedMemberRows);
  }, [splitType, form.amount, selectedMemberRows]);

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value
    }));
    setSuccess('');
    setError('');
  };

  const handleSplitTypeChange = (event) => {
    const value = event.target.value;
    setSplitType(value);
    setSuccess('');
    setError('');

    if (value === 'equal') {
      setMemberRows(createMemberRows(members));
    } else if (memberRows.length === 0) {
      setMemberRows(createMemberRows(members));
    }
  };

  const handleRowChange = (userId, value) => {
    setMemberRows((prev) =>
      prev.map((row) => (row.userId === userId ? { ...row, value } : row))
    );
    setSuccess('');
    setError('');
  };

  const buildSplitsPayload = () => {
    if (splitType === 'equal') {
      return members.map((member) => ({
        userId: member.user.id,
        value: 1
      }));
    }

    return memberRows
      .filter((row) => row.value !== '' && row.value !== null && row.value !== undefined)
      .map((row) => ({
        userId: row.userId,
        value: Number(row.value)
      }));
  };

  const validateSplitData = () => {
    const amount = Number(form.amount);
    if (!form.description.trim()) return 'Description is required';
    if (!form.expenseDate) return 'Expense date is required';
    if (!amount || amount <= 0) return 'Amount must be greater than 0';
    if (!splitType) return 'Split type is required';

    if (splitType === 'equal') {
      return null;
    }

    const total = runningTotal;

    if (splitType === 'unequal' && Math.abs(total - amount) > 0.01) {
      return `Unequal split values must total ${formatCurrency(amount)}`;
    }

    if (splitType === 'percentage' && Math.abs(total - 100) > 0.01) {
      return 'Percentage split values must total 100%';
    }

    if (splitType === 'share' && total <= 0) {
      return 'Share values must be greater than 0';
    }

    return null;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateSplitData();
    if (validationError) {
      setError(validationError);
      return;
    }

    try {
      setSaving(true);
      setError('');
      setSuccess('');

      await api.post(`/groups/${id}/expenses`, {
        description: form.description.trim(),
        expenseDate: form.expenseDate,
        amount: Number(form.amount),
        currency: form.currency,
        exchangeRate: form.currency === 'USD' ? Number(form.exchangeRate || 83) : null,
        splitType,
        splits: buildSplitsPayload(),
        importedRow: null
      });

      setSuccess('Expense created successfully');
      setForm({
        description: '',
        expenseDate: getTodayValue(),
        amount: '',
        currency: 'INR',
        exchangeRate: 83
      });
      setSplitType('equal');
      setMemberRows(createMemberRows(members));
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create expense');
    } finally {
      setSaving(false);
    }
  };

  const renderSplitInputs = () => {
    if (splitType === 'equal') {
      return (
        <div className="member-preview">
          {members.map((member) => (
            <div key={member.user.id} className="member-row">
              <span>{member.user.name}</span>
              <span>Equal share</span>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div className="split-input-list">
        {memberRows.map((row) => (
          <div key={row.userId} className="split-input-row">
            <div>
              <h4>{row.name}</h4>
              <p>{row.email}</p>
            </div>
            <input
              type="number"
              min="0"
              step={splitType === 'percentage' ? '0.01' : '0.01'}
              value={row.value}
              onChange={(event) => handleRowChange(row.userId, event.target.value)}
              placeholder={splitType === 'percentage' ? '0%' : '0.00'}
            />
          </div>
        ))}

        <div className="split-total-box">
          <span>Running total</span>
          <strong>
            {splitType === 'percentage'
              ? `${runningTotal.toFixed(2)}%`
              : formatCurrency(runningTotal)}
          </strong>
        </div>
      </div>
    );
  };

  if (loading) {
    return <div className="new-expense-shell loading">Loading group...</div>;
  }

  if (error && !group) {
    return (
      <div className="new-expense-shell">
        <div className="error-box">{error}</div>
      </div>
    );
  }

  return (
    <div className="new-expense-shell">
      <header className="new-expense-header">
        <div>
          <p className="eyebrow">Add Expense</p>
          <h1>{group?.name}</h1>
          <p className="subtext">Create a new expense with dynamic split inputs.</p>
        </div>
        <Link to={`/groups/${id}`} className="back-link">
          Back to Group
        </Link>
      </header>

      {error && <div className="expense-alert error">{error}</div>}
      {success && <div className="expense-alert success">{success}</div>}

      <main className="new-expense-grid">
        <section className="expense-card">
          <h2>Expense Details</h2>

          <form className="expense-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="description">Description</label>
              <input
                id="description"
                name="description"
                value={form.description}
                onChange={handleFormChange}
                placeholder="Dinner, rent, groceries..."
                required
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="expenseDate">Date</label>
                <input
                  id="expenseDate"
                  name="expenseDate"
                  type="date"
                  value={form.expenseDate}
                  onChange={handleFormChange}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="amount">Amount</label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={handleFormChange}
                  placeholder="0.00"
                  required
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label htmlFor="currency">Currency</label>
                <select id="currency" name="currency" value={form.currency} onChange={handleFormChange}>
                  <option value="INR">INR</option>
                  <option value="USD">USD</option>
                </select>
              </div>

              {form.currency === 'USD' && (
                <div className="form-group">
                  <label htmlFor="exchangeRate">Exchange Rate</label>
                  <input
                    id="exchangeRate"
                    name="exchangeRate"
                    type="number"
                    min="1"
                    step="0.01"
                    value={form.exchangeRate}
                    onChange={handleFormChange}
                  />
                </div>
              )}
            </div>

            <div className="form-group">
              <label htmlFor="splitType">Split Type</label>
              <select id="splitType" value={splitType} onChange={handleSplitTypeChange}>
                {SPLIT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            <div className="split-section">
              <div className="section-heading">
                <h3>Split Inputs</h3>
                <span>{splitType}</span>
              </div>
              {renderSplitInputs()}
            </div>

            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Expense'}
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}
