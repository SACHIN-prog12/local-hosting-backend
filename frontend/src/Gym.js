import React, { useState, useEffect, useCallback } from 'react';
import './Gym.css';

// API Configuration
// For Electron, the backend will run on localhost:5000 by default.
// If you are using create-react-app development server, REACT_APP_API_URL will be used.
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

// API Service with better error handling
const apiService = {
  handleResponse: async (response) => {
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Network error or malformed JSON' }));
      throw new Error(error.error || `HTTP ${response.status} - ${response.statusText}`);
    }
    return response.json();
  },

  getMembers: async (params = {}) => {
    const queryString = new URLSearchParams(params).toString();
    const response = await fetch(`${API_BASE_URL}/members?${queryString}`);
    return apiService.handleResponse(response);
  },

  createMember: async (memberData) => {
    const response = await fetch(`${API_BASE_URL}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memberData)
    });
    return apiService.handleResponse(response);
  },

  updateMember: async (id, memberData) => {
    const response = await fetch(`${API_BASE_URL}/members/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memberData)
    });
    return apiService.handleResponse(response);
  },

  deleteMember: async (id) => {
    const response = await fetch(`${API_BASE_URL}/members/${id}`, {
      method: 'DELETE'
    });
    return apiService.handleResponse(response);
  },

  updateFeeStatus: async (id, feeStatus) => {
    const response = await fetch(`${API_BASE_URL}/members/${id}/fee-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeStatus })
    });
    return apiService.handleResponse(response);
  },

  updateOverdueMembers: async () => {
    const response = await fetch(`${API_BASE_URL}/update-overdue`, {
      method: 'POST'
    });
    return apiService.handleResponse(response);
  },

  getStats: async () => {
    const response = await fetch(`${API_BASE_URL}/stats`);
    return apiService.handleResponse(response);
  }
};

// Toast notification component
const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div className={`toast toast-${type}`}>
      <span>{message}</span>
      <button onClick={onClose} className="toast-close">×</button>
    </div>
  );
};

// Statistics Component
const Statistics = ({ stats, loading }) => {
  if (loading) {
    return (
      <div className="statistics loading">
        <div className="stat-card skeleton"></div>
        <div className="stat-card skeleton"></div>
        <div className="stat-card skeleton"></div>
        <div className="stat-card skeleton"></div>
      </div>
    );
  }

  return (
    <div className="statistics">
      <div className="stat-card total">
        <div className="stat-icon">👥</div>
        <div className="stat-content">
          <h3>{stats.totalMembers || 0}</h3>
          <p>Total Members</p>
        </div>
      </div>
      <div className="stat-card paid">
        <div className="stat-icon">✅</div>
        <div className="stat-content">
          <h3>{stats.paidMembers || 0}</h3>
          <p>Paid Members</p>
        </div>
      </div>
      <div className="stat-card unpaid">
        <div className="stat-icon">❌</div>
        <div className="stat-content">
          <h3>{stats.unpaidMembers || 0}</h3>
          <p>Unpaid Members</p>
        </div>
      </div>
      <div className="stat-card overdue">
        <div className="stat-icon">⏰</div>
        <div className="stat-content">
          <h3>{stats.overdueMembers || 0}</h3>
          <p>Overdue Members</p>
        </div>
      </div>
    </div>
  );
};

// Member Form Component
const MemberForm = ({ onRefresh, onShowToast }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '', // Changed from whatsapp to phone
    admissionDate: '',
    membershipType: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required'; // Changed from whatsapp to phone
    if (!formData.admissionDate) newErrors.admissionDate = 'Admission date is required';
    if (!formData.membershipType) newErrors.membershipType = 'Membership type is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      await apiService.createMember(formData);
      setFormData({
        name: '',
        phone: '', // Changed from whatsapp to phone
        admissionDate: '',
        membershipType: ''
      });
      onRefresh();
      onShowToast('Member added successfully!', 'success');
    } catch (error) {
      onShowToast(`Failed to add member: ${error.message}`, 'error');
    }
    setLoading(false);
  };

  return (
    <div className="member-form">
      <h2>Add New Member</h2>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-group">
            <label>Member Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter member name"
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </div>
          
          <div className="form-group">
            <label>Phone Number *</label> {/* Changed from WhatsApp to Phone */}
            <input
              type="tel"
              name="phone" // Changed from whatsapp to phone
              value={formData.phone} // Changed from whatsapp to phone
              onChange={handleChange}
              placeholder="Enter phone number" // Changed from WhatsApp to Phone
              className={errors.phone ? 'error' : ''} // Changed from whatsapp to phone
            />
            {errors.phone && <span className="error-text">{errors.phone}</span>} {/* Changed from whatsapp to phone */}
          </div>
          
          <div className="form-group">
            <label>Admission Date *</label>
            <input
              type="date"
              name="admissionDate"
              value={formData.admissionDate}
              onChange={handleChange}
              className={errors.admissionDate ? 'error' : ''}
            />
            {errors.admissionDate && <span className="error-text">{errors.admissionDate}</span>}
          </div>
          
          <div className="form-group">
            <label>Membership Type *</label>
            <select
              name="membershipType"
              value={formData.membershipType}
              onChange={handleChange}
              className={errors.membershipType ? 'error' : ''}
            >
              <option value="">Select membership type</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly (3 months)</option>
              <option value="Half-Yearly">Half-Yearly (6 months)</option>
              <option value="Yearly">Yearly</option>
            </select>
            {errors.membershipType && <span className="error-text">{errors.membershipType}</span>}
          </div>
        </div>
        
        <div className="form-actions">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? (
              <>
                <span className="spinner"></span>
                Adding...
              </>
            ) : (
              'Add Member'
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

// Search Filter Component
const SearchFilter = ({ 
  searchTerm, 
  setSearchTerm, 
  statusFilter, 
  setStatusFilter, 
  onClearFilters,
  onUpdateOverdue,
  onShowToast
}) => {
  const [updating, setUpdating] = useState(false);

  const handleUpdateOverdue = async () => {
    setUpdating(true);
    try {
      const result = await apiService.updateOverdueMembers();
      onShowToast(`Updated ${result.modifiedCount} overdue members`, 'success');
      onUpdateOverdue();
    } catch (error) {
      onShowToast(`Failed to update overdue members: ${error.message}`, 'error');
    }
    setUpdating(false);
  };

  return (
    <div className="search-filter">
      <div className="filter-controls">
        <div className="search-input-container">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="🔍 Search members by name or phone..." // Changed from WhatsApp to Phone
            className="search-input"
          />
        </div>
        
        <select 
          value={statusFilter} 
          onChange={(e) => setStatusFilter(e.target.value)}
          className="status-filter"
        >
          <option value="">All Members</option>
          <option value="paid">Paid Only</option>
          <option value="unpaid">Unpaid Only</option>
        </select>
        
        <button 
          type="button" 
          onClick={onClearFilters}
          className="btn-secondary"
        >
          Clear Filters
        </button>
        
        <button 
          type="button" 
          onClick={handleUpdateOverdue}
          className="btn-warning"
          disabled={updating}
        >
          {updating ? (
            <>
              <span className="spinner"></span>
              Checking...
            </>
          ) : (
            'Check Overdue'
          )}
        </button>
      </div>
    </div>
  );
};

// Member Card Component
const MemberCard = ({ member, onEdit, onDelete, onUpdateFeeStatus }) => {
  const [updating, setUpdating] = useState(false);

  const formatDate = (dateString) => {
    // Ensure the date is treated as UTC to avoid timezone issues affecting the date display
    const date = new Date(dateString);
    return new Date(date.getTime() + date.getTimezoneOffset() * 60000).toLocaleDateString('en-GB');
  };

  const handleFeeStatusChange = async (e) => {
    const newStatus = e.target.value;
    setUpdating(true);
    try {
      await onUpdateFeeStatus(member._id, newStatus);
    } catch (error) {
      console.error('Failed to update fee status:', error);
    }
    setUpdating(false);
  };

  const nextPaymentDate = new Date(member.nextPaymentDue);
  const today = new Date();
  today.setHours(0,0,0,0); // Normalize today to start of day

  // Check if nextPaymentDue is in the past AND feeStatus is unpaid for overdue
  // The backend now sets feeStatus to unpaid for overdue members.
  const isOverdue = member.feeStatus === 'unpaid' && nextPaymentDate < today;

  const daysUntilDue = Math.ceil((nextPaymentDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));


  return (
    <div className={`member-card ${member.feeStatus} ${isOverdue ? 'overdue' : ''}`}>
      <div className="member-header">
        <h3>{member.name}</h3>
        <span className={`status-badge ${member.feeStatus}`}>
          {member.feeStatus.toUpperCase()}
        </span>
      </div>
      
      <div className="member-details">
        <div className="detail-row">
          <span className="label">📱 Phone:</span> {/* Changed from WhatsApp to Phone */}
          <span className="value">{member.phone}</span> {/* Changed from whatsapp to phone */}
        </div>
        <div className="detail-row">
          <span className="label">📅 Admission:</span>
          <span className="value">{formatDate(member.admissionDate)}</span>
        </div>
        <div className="detail-row">
          <span className="label">🎯 Membership:</span>
          <span className="value">{member.membershipType}</span>
        </div>
        <div className="detail-row">
          <span className="label">💳 Next Due:</span>
          <span className={`value ${isOverdue ? 'overdue-date' : daysUntilDue > 0 && daysUntilDue <= 3 ? 'warning-date' : ''}`}>
            {formatDate(member.nextPaymentDue)}
            {/* Display "X days" if due within 7 days and not overdue */}
            {member.feeStatus === 'paid' && daysUntilDue > 0 && daysUntilDue <= 7 && (
              <small className="days-remaining">({daysUntilDue} days)</small>
            )}
             {/* Display "Overdue" if actually overdue */}
            {isOverdue && (
              <small className="days-remaining">(Overdue)</small>
            )}
          </span>
        </div>
      </div>

      <div className="member-actions">
        <select 
          value={member.feeStatus} 
          onChange={handleFeeStatusChange}
          className="status-select"
          disabled={updating}
        >
          <option value="paid">Paid</option>
          <option value="unpaid">Unpaid</option>
        </select>
        
        <div className="action-buttons">
          <button 
            onClick={() => onEdit(member)}
            className="btn-edit"
            title="Edit member"
          >
            ✏️
          </button>
          <button 
            onClick={() => onDelete(member._id)}
            className="btn-delete"
            title="Delete member"
          >
            🗑️
          </button>
        </div>
      </div>
    </div>
  );
};

// Member List Component
const MemberList = ({ members, loading, onEditMember, onDeleteMember, onUpdateFeeStatus }) => {
  if (loading) {
    return (
      <div className="member-grid">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="member-card skeleton">
            <div className="skeleton-content"></div>
          </div>
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="no-members">
        <div className="no-members-icon">👥</div>
        <h3>No members found</h3>
        <p>Add your first member to get started!</p>
      </div>
    );
  }

  return (
    <div className="member-grid">
      {members.map(member => (
        <MemberCard
          key={member._id}
          member={member}
          onEdit={onEditMember}
          onDelete={onDeleteMember}
          onUpdateFeeStatus={onUpdateFeeStatus}
        />
      ))}
    </div>
  );
};

// Edit Modal Component
const EditModal = ({ member, onUpdateMember, onClose, onShowToast }) => {
  const [formData, setFormData] = useState({
    name: '',
    phone: '', // Changed from whatsapp to phone
    admissionDate: '',
    membershipType: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name,
        phone: member.phone, // Changed from whatsapp to phone
        admissionDate: member.admissionDate.split('T')[0], // Assuming date string format from backend
        membershipType: member.membershipType
      });
    }
  }, [member]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required'; // Changed from whatsapp to phone
    if (!formData.admissionDate) newErrors.admissionDate = 'Admission date is required';
    if (!formData.membershipType) newErrors.membershipType = 'Membership type is required';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) return;

    setLoading(true);
    try {
      await onUpdateMember(member._id, formData);
      onShowToast('Member updated successfully!', 'success');
      onClose();
    } catch (error) {
      onShowToast(`Failed to update member: ${error.message}`, 'error');
    }
    setLoading(false);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2>Edit Member</h2>
          <button 
            onClick={onClose}
            className="close-button"
          >
            ×
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="modal-form">
          <div className="form-group">
            <label>Member Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className={errors.name ? 'error' : ''}
            />
            {errors.name && <span className="error-text">{errors.name}</span>}
          </div>
          
          <div className="form-group">
            <label>Phone Number *</label> {/* Changed from WhatsApp to Phone */}
            <input
              type="tel"
              name="phone" // Changed from whatsapp to phone
              value={formData.phone} // Changed from whatsapp to phone
              onChange={handleChange}
              className={errors.phone ? 'error' : ''} // Changed from whatsapp to phone
            />
            {errors.phone && <span className="error-text">{errors.phone}</span>} {/* Changed from whatsapp to phone */}
          </div>
          
          <div className="form-group">
            <label>Admission Date *</label>
            <input
              type="date"
              name="admissionDate"
              value={formData.admissionDate}
              onChange={handleChange}
              className={errors.admissionDate ? 'error' : ''}
            />
            {errors.admissionDate && <span className="error-text">{errors.admissionDate}</span>}
          </div>
          
          <div className="form-group">
            <label>Membership Type *</label>
            <select
              name="membershipType"
              value={formData.membershipType}
              onChange={handleChange}
              className={errors.membershipType ? 'error' : ''}
            >
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly (3 months)</option>
              <option value="Half-Yearly">Half-Yearly (6 months)</option>
              <option value="Yearly">Yearly</option>
            </select>
            {errors.membershipType && <span className="error-text">{errors.membershipType}</span>}
          </div>
          
          <div className="modal-actions">
            <button 
              type="submit" 
              className="btn-primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <span className="spinner"></span>
                  Updating...
                </>
              ) : (
                'Update Member'
              )}
            </button>
            <button 
              type="button" 
              onClick={onClose}
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Main App Component
const Gym = () => {
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState({});
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingMember, setEditingMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState(null);

  // Show toast notification
  const showToast = useCallback((message, type = 'info') => {
    setToast({ message, type });
  }, []);

  // Load members from API
  const loadMembers = useCallback(async () => {
    try {
      setLoading(true);
      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (statusFilter) params.status = statusFilter;
      
      const data = await apiService.getMembers(params);
      setMembers(data.members || data); // Handle both paginated and simple response
      setError('');
    } catch (err) {
      setError('Failed to load members: ' + err.message);
      setMembers([]);
      showToast('Failed to load members', 'error');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, statusFilter, showToast]);

  // Load statistics
  const loadStats = useCallback(async () => {
    try {
      setStatsLoading(true);
      const data = await apiService.getStats();
      setStats(data);
    } catch (err) {
      console.error('Failed to load stats:', err);
      setStats({});
    } finally {
      setStatsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadMembers();
    loadStats();
  }, [loadMembers, loadStats]);

  // Filter members locally for immediate response
  useEffect(() => {
    const filtered = members.filter(member => {
      const matchesSearch = !searchTerm || 
        member.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        member.phone.includes(searchTerm); // Changed from whatsapp to phone
      const matchesStatus = !statusFilter || member.feeStatus === statusFilter;
      return matchesSearch && matchesStatus;
    });
    setFilteredMembers(filtered);
  }, [members, searchTerm, statusFilter]);

  // Refresh data
  const refreshData = useCallback(() => {
    loadMembers();
    loadStats();
  }, [loadMembers, loadStats]);

  // Update member
  const updateMember = async (id, memberData) => {
    try {
      await apiService.updateMember(id, memberData);
      refreshData();
    } catch (error) {
      throw error;
    }
  };

  // Delete member
  const deleteMember = async (id) => {
    if (window.confirm('Are you sure you want to delete this member?')) {
      try {
        await apiService.deleteMember(id);
        refreshData();
        showToast('Member deleted successfully', 'success');
      } catch (error) {
        showToast('Failed to delete member: ' + error.message, 'error');
      }
    }
  };

  // Update fee status
  const updateFeeStatus = async (id, feeStatus) => {
    try {
      await apiService.updateFeeStatus(id, feeStatus);
      refreshData();
      showToast(`Fee status updated to ${feeStatus}`, 'success');
    } catch (error) {
      showToast('Failed to update fee status: ' + error.message, 'error');
      throw error;
    }
  };

  // Clear filters
  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('');
  };

  if (error && !members.length) {
    return (
      <div className="gym-app">
        <div className="error-container">
          <div className="error-icon">⚠️</div>
          <h2>Connection Error</h2>
          <p>{error}</p>
          <button onClick={refreshData} className="btn-primary">
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="gym-app">
      {toast && (
        <Toast 
          message={toast.message} 
          type={toast.type} 
          onClose={() => setToast(null)} 
        />
      )}

      <header className="app-header">
        <div className="header-content">
          <h1>💪 Gym Management System</h1>
          <p>Manage your gym members efficiently</p>
        </div>
      </header>

      <main className="app-main">
        <Statistics stats={stats} loading={statsLoading} />
        
        <MemberForm onRefresh={refreshData} onShowToast={showToast} />
        
        <SearchFilter
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          onClearFilters={clearFilters}
          onUpdateOverdue={refreshData}
          onShowToast={showToast}
        />
        
        <div className="members-section">
          <div className="section-header">
            <h2>Members ({filteredMembers.length})</h2>
            <button 
              onClick={refreshData} 
              className="btn-refresh"
              title="Refresh data"
            >
              🔄
            </button>
          </div>
          
          <MemberList
            members={filteredMembers}
            loading={loading}
            onEditMember={setEditingMember}
            onDeleteMember={deleteMember}
            onUpdateFeeStatus={updateFeeStatus}
          />
        </div>
      </main>

      {editingMember && (
        <EditModal
          member={editingMember}
          onUpdateMember={updateMember}
          onClose={() => setEditingMember(null)}
          onShowToast={showToast}
        />
      )}
    </div>
  );
};

export default Gym;