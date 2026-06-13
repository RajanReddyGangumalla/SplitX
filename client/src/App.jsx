import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GroupDetail from './pages/GroupDetail';
import ExpenseDetail from './pages/ExpenseDetail';
import ImportCSV from './pages/ImportCSV';
import Settlement from './pages/Settlement';
import NewExpense from './pages/NewExpense';
import './styles/App.css';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Navigate to={localStorage.getItem('token') ? '/dashboard' : '/login'} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/groups/:id" element={<GroupDetail />} />
        <Route path="/expenses/:id" element={<ExpenseDetail />} />
        <Route path="/import" element={<ImportCSV />} />
        <Route path="/groups/:id/expenses/new" element={<NewExpense />} />
        <Route path="/settle" element={<Settlement />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
