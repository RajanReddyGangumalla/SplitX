import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import '../styles/Settlement.css';

function formatCurrency(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

export default function Settlement() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [form, setForm] = useState({
    payeeId: '',
    amount: ''
  });
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    async function loadGroups() {
      try {
        setLoading(true);
        setError('');

        const response = await api.get('/groups');
        setGroups(response.data.groups || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load groups');
      } finally {
        setLoading(false);
      }
    }

    loadGroups();
  }, [navigate]);

  useEffect(() => {
    async function loadGroupMembers() {
      if (!selectedGroupId) {
        setGroupMembers([]);
        setForm((prev) => ({ ...prev, payeeId: '' }));
        return;
      }

      try {
        const response = await api.get(`/groups/${selectedGroupId}`);
        setGroupMembers(response.data.group?.members || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load group members');
      }
    }

    loadGroupMembers();
  }, [selectedGroupId]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({
      ...prev,
      [name]: value
    }));
  };

  const handleGroupChange = (event) => {
    setSelectedGroupId(event.target.value);
    setForm({ payeeId: '', amount: '' });
    setSuccess('');
    setError('');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!selectedGroupId) {
      setError('Please select a group');
      return;
    }

    if (!form.payeeId) {
      setError('Please select a payee');
      return;
    }

    if (!form.amount || Number(form.amount) <= 0) {
      setError('Amount must be greater than 0');
      return;
    }

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');

      await api.post('/settlements', {
        groupId: selectedGroupId,
        payeeId: form.payeeId,
        amount: Number(form.amount)
      });

      setSuccess('Settlement recorded successfully');
      setForm({ payeeId: '', amount: '' });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to record settlement');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="settlement-shell">
      <header className="settlement-header">
        <div>
          <p className="eyebrow">Settlement</p>
          <h1>Record a Payment</h1>
          <p className="subtext">Choose a group, select the person you paid, and enter the amount.</p>
        </div>
        <button type="button" className="back-link" onClick={() => navigate('/dashboard')}>
          Back to Dashboard
        </button>
      </header>

      {error && <div className="settlement-alert error">{error}</div>}
      {success && <div className="settlement-alert success">{success}</div>}

      <main className="settlement-grid">
        <section className="settlement-card">
          <h2>Settlement Form</h2>
          {loading ? (
            <p className="empty-state">Loading groups...</p>
          ) : groups.length === 0 ? (
            <p className="empty-state">You are not part of any groups yet.</p>
          ) : (
            <form className="settlement-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="group">Group</label>
                <select id="group" value={selectedGroupId} onChange={handleGroupChange} required>
                  <option value="">Select a group</option>
                  {groups.map((group) => (
                    <option key={group.id} value={group.id}>
                      {group.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label htmlFor="payeeId">Payee</label>
                <select
                  id="payeeId"
                  name="payeeId"
                  value={form.payeeId}
                  onChange={handleChange}
                  disabled={!selectedGroupId}
                  required
                >
                  <option value="">Select a person</option>
                  {groupMembers
                    .filter((member) => member.user.id !== JSON.parse(localStorage.getItem('user') || '{}')?.id)
                    .map((member) => (
                      <option key={member.user.id} value={member.user.id}>
                        {member.user.name} ({member.user.email})
                      </option>
                    ))}
                </select>
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
                  onChange={handleChange}
                  placeholder="0.00"
                  required
                />
              </div>

              <div className="preview-box">
                <span>Preview</span>
                <strong>
                  {form.amount ? formatCurrency(form.amount) : '₹0.00'} to{' '}
                  {groupMembers.find((member) => member.user.id === form.payeeId)?.user.name || 'select payee'}
                </strong>
              </div>

              <button type="submit" className="btn btn-primary" disabled={submitting}>
                {submitting ? 'Saving...' : 'Submit Settlement'}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
