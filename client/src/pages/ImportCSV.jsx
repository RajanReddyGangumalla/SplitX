import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import '../styles/ImportCSV.css';

const ACTION_LABELS = {
  IMPORTED: 'IMPORTED',
  SKIPPED: 'SKIPPED',
  FLAGGED: 'FLAGGED',
  RECLASSIFIED: 'RECLASSIFIED',
  CONVERTED: 'CONVERTED'
};

function getActionClass(action = '') {
  if (action === 'RECLASSIFIED') return 'action-reclassified';
  if (action === 'FLAGGED' || action === 'SKIPPED') return 'action-danger';
  if (action === 'CONVERTED') return 'action-converted';
  return 'action-imported';
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  return String(value);
}

export default function ImportCSV() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [importLog, setImportLog] = useState(null);
  const [confirmed, setConfirmed] = useState(false);

  const anomalyRows = useMemo(() => importLog?.anomalies || [], [importLog]);

  React.useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      navigate('/login');
      return;
    }

    async function loadGroups() {
      try {
        const response = await api.get('/groups');
        setGroups(response.data.groups || []);
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load groups');
      }
    }

    loadGroups();
  }, [navigate]);

  const handleFileChange = (event) => {
    const selectedFile = event.target.files?.[0] || null;
    setFile(selectedFile);
    setError('');
    setSuccess('');
    setImportLog(null);
    setConfirmed(false);
  };

  const handleCancel = () => {
    setSelectedGroupId('');
    setFile(null);
    setError('');
    setSuccess('');
    setImportLog(null);
    setConfirmed(false);
  };

  const handleImport = async (event) => {
    event.preventDefault();

    if (!file) {
      setError('Please choose a CSV file first');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV files are allowed');
      return;
    }

    if (!selectedGroupId) {
      setError('Please select a group before importing');
      return;
    }

    try {
      setLoading(true);
      setError('');
      setSuccess('');
      setConfirmed(false);

      const formData = new FormData();
      formData.append('file', file);
      formData.append('groupId', selectedGroupId);

      const response = await api.post('/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      setImportLog(response.data.importLog);
      setSuccess('CSV uploaded and analyzed successfully. Review the anomaly report below.');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload CSV');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    setConfirmed(true);
    setSuccess('Import confirmed. You can now review the anomaly report or upload another file.');
  };

  return (
    <div className="import-shell">
      <header className="import-header">
        <div>
          <p className="eyebrow">Import</p>
          <h1>Upload CSV</h1>
          <p className="subtext">Import the messy spreadsheet and review anomalies before finalizing.</p>
        </div>
        <Link to="/dashboard" className="back-link">
          Back to Dashboard
        </Link>
      </header>

      {error && <div className="import-alert error">{error}</div>}
      {success && <div className="import-alert success">{success}</div>}

      <main className="import-grid">
        <section className="import-card">
          <h2>Choose File</h2>
          <p className="helper-text">Upload a `.csv` file. The backend will analyze the rows and return an anomaly report.</p>

          <form onSubmit={handleImport} className="import-form">
            <div className="form-group">
              <label htmlFor="groupId">Group</label>
              <select
                id="groupId"
                value={selectedGroupId}
                onChange={(event) => setSelectedGroupId(event.target.value)}
                required
              >
                <option value="">Select a group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="file-dropzone">
              <input type="file" accept=".csv,text/csv" onChange={handleFileChange} />
              <span>{file ? file.name : 'Click to select a CSV file'}</span>
              <small>{file ? `${Math.round(file.size / 1024)} KB` : 'Only CSV files are supported'}</small>
            </label>

            <div className="button-row">
              <button type="submit" className="btn btn-primary" disabled={loading || !file}>
                {loading ? 'Uploading...' : 'Confirm Import'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={loading && !file}>
                Cancel
              </button>
            </div>
          </form>
        </section>

        <section className="import-card wide">
          <div className="section-heading">
            <h2>Anomaly Report</h2>
            <span>{anomalyRows.length} findings</span>
          </div>

          {importLog ? (
            <>
              <div className="stats-grid">
                <div>
                  <span>Total Rows</span>
                  <strong>{importLog.totalRows}</strong>
                </div>
                <div>
                  <span>Imported</span>
                  <strong className="status-green">{importLog.imported}</strong>
                </div>
                <div>
                  <span>Skipped</span>
                  <strong className="status-red">{importLog.skipped}</strong>
                </div>
                <div>
                  <span>Flagged</span>
                  <strong className="status-red">{importLog.flagged}</strong>
                </div>
              </div>

              {anomalyRows.length === 0 ? (
                <p className="empty-state">No anomalies found.</p>
              ) : (
                <div className="table-wrap">
                  <div className="report-table">
                    <div className="report-head">
                      <span>Row#</span>
                      <span>Description</span>
                      <span>Issue</span>
                      <span>Action</span>
                      <span>Original Value</span>
                      <span>Resolved Value</span>
                    </div>
                    {anomalyRows.map((row, index) => (
                      <div key={`${row.rowNumber}-${row.issue}-${index}`} className={`report-row ${getActionClass(row.action)}`}>
                        <span>{row.rowNumber}</span>
                        <span>{row.description || row.field}</span>
                        <span>{row.issue}</span>
                        <span className={`action-pill ${getActionClass(row.action)}`}>
                          {ACTION_LABELS[row.action] || row.action}
                        </span>
                        <span>{formatValue(row.originalVal)}</span>
                        <span>{formatValue(row.resolvedVal)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="button-row report-actions">
                <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={confirmed}>
                  {confirmed ? 'Confirmed' : 'Confirm Import'}
                </button>
                <button type="button" className="btn btn-secondary" onClick={handleCancel}>
                  Cancel
                </button>
              </div>
            </>
          ) : (
            <p className="empty-state">Upload a CSV to see the anomaly report here.</p>
          )}
        </section>
      </main>
    </div>
  );
}
