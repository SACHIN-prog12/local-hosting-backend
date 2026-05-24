import React, { useState, useEffect, useCallback } from 'react';
import './Gym.css';

const getApiBaseUrl = () => {
  const saved = localStorage.getItem('gym_api_url');
  if (saved) return saved;

  // If running inside Electron
  if (window.electronAPI) {
    return 'http://localhost:5000/api';
  }

  // Always use localhost:5000 during development
  if (process.env.NODE_ENV === 'development') {
    return 'http://localhost:5000/api';
  }

  // Production fallback (window origin + /api)
  return window.location.origin + '/api';
};


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
    const response = await fetch(`${getApiBaseUrl()}/members?${queryString}`);
    return apiService.handleResponse(response);
  },

  createMember: async (memberData) => {
    const response = await fetch(`${getApiBaseUrl()}/members`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memberData)
    });
    return apiService.handleResponse(response);
  },

  updateMember: async (id, memberData) => {
    const response = await fetch(`${getApiBaseUrl()}/members/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(memberData)
    });
    return apiService.handleResponse(response);
  },

  deleteMember: async (id) => {
    const response = await fetch(`${getApiBaseUrl()}/members/${id}`, {
      method: 'DELETE'
    });
    return apiService.handleResponse(response);
  },

  updateFeeStatus: async (id, feeStatus) => {
    const response = await fetch(`${getApiBaseUrl()}/members/${id}/fee-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ feeStatus })
    });
    return apiService.handleResponse(response);
  },

  updateOverdueMembers: async () => {
    const response = await fetch(`${getApiBaseUrl()}/trigger-maintenance`, {
      method: 'POST'
    });
    return apiService.handleResponse(response);
  },

  getStats: async () => {
    const response = await fetch(`${getApiBaseUrl()}/stats`);
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
  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    admissionDate: '',
    membershipType: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (window.innerWidth > 768) {
      setIsOpen(true);
    }
  }, []);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
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
        phone: '',
        admissionDate: '',
        membershipType: ''
      });
      onRefresh();
      onShowToast('Member added successfully!', 'success');
      // Collapse on mobile after adding successfully
      if (window.innerWidth <= 768) {
        setIsOpen(false);
      }
    } catch (error) {
      onShowToast(`Failed to add member: ${error.message}`, 'error');
    }
    setLoading(false);
  };

  return (
    <div className={`member-form-container glass-card ${isOpen ? 'open' : 'collapsed'}`}>
      <div className="section-toggle-header" onClick={() => setIsOpen(!isOpen)}>
        <h2>💪 Add New Member</h2>
        <span className="toggle-icon">{isOpen ? '▲' : '▼'}</span>
      </div>
      
      {isOpen && (
        <form onSubmit={handleSubmit} className="member-form-body fade-in">
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
              <label>Phone Number *</label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                placeholder="Enter phone number"
                className={errors.phone ? 'error' : ''}
              />
              {errors.phone && <span className="error-text">{errors.phone}</span>}
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
      )}
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
  const [isOpen, setIsOpen] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    if (window.innerWidth > 768) {
      setIsOpen(true);
    }
  }, []);

  const handleUpdateOverdue = async () => {
    setUpdating(true);
    try {
      await apiService.updateOverdueMembers();
      onShowToast(`Daily maintenance and SMS tasks completed successfully!`, 'success');
      onUpdateOverdue();
    } catch (error) {
      onShowToast(`Failed to update: ${error.message}`, 'error');
    }
    setUpdating(false);
  };

  return (
    <div className={`search-filter-container glass-card ${isOpen ? 'open' : 'collapsed'}`}>
      <div className="section-toggle-header" onClick={() => setIsOpen(!isOpen)}>
        <h2>🔍 Search & Filters</h2>
        <span className="toggle-icon">{isOpen ? '▲' : '▼'}</span>
      </div>
      
      {isOpen && (
        <div className="search-filter-body filter-controls fade-in">
          <div className="search-input-container">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="🔍 Search members by name or phone..."
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
              '⚡ Check Overdue'
            )}
          </button>
        </div>
      )}
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
          <span className="label">📱 Phone:</span>
          <span className="value">{member.phone}</span>
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
    phone: '',
    admissionDate: '',
    membershipType: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (member) {
      setFormData({
        name: member.name,
        phone: member.phone,
        admissionDate: member.admissionDate.split('T')[0], // Assuming date string format from backend
        membershipType: member.membershipType
      });
    }
  }, [member]);

  const validateForm = () => {
    const newErrors = {};
    
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
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
            <label>Phone Number *</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className={errors.phone ? 'error' : ''}
            />
            {errors.phone && <span className="error-text">{errors.phone}</span>}
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

// Settings Modal Component
const SettingsModal = ({ onClose, onShowToast }) => {
  const [apiUrl, setApiUrl] = useState('');
  const [testStatus, setTestStatus] = useState(null); // 'testing', 'success', 'error'
  const [testMessage, setTestMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setApiUrl(getApiBaseUrl());
  }, []);

  const handleTestConnection = async () => {
    if (!apiUrl.trim()) {
      setTestStatus('error');
      setTestMessage('API URL cannot be empty');
      return;
    }
    
    setTestStatus('testing');
    setTestMessage('⚡ Pinging server health endpoint...');
    
    try {
      const startTime = Date.now();
      const trimmedUrl = apiUrl.trim().replace(/\/+$/, '');
      const response = await fetch(`${trimmedUrl}/health`, { 
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      const duration = Date.now() - startTime;
      
      if (response.ok) {
        const data = await response.json();
        setTestStatus('success');
        setTestMessage(`🟢 Connected! Latency: ${duration}ms (uptime: ${Math.round(data.uptime || 0)}s)`);
      } else {
        throw new Error(`HTTP ${response.status} - ${response.statusText}`);
      }
    } catch (error) {
      setTestStatus('error');
      setTestMessage(`🔴 Connection failed: ${error.message}. Please check if the server is running and CORS is configured.`);
    }
  };

  const handleSave = () => {
    setSaving(true);
    try {
      const trimmedUrl = apiUrl.trim().replace(/\/+$/, '');
      localStorage.setItem('gym_api_url', trimmedUrl);
      onShowToast('Connection settings saved! Reloading...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      onShowToast(`Failed to save settings: ${err.message}`, 'error');
      setSaving(false);
    }
  };

  const handleReset = () => {
    localStorage.removeItem('gym_api_url');
    onShowToast('Reset to default API URL. Reloading...', 'info');
    setTimeout(() => {
      window.location.reload();
    }, 1500);
  };

  const handleUsePreset = (presetType) => {
    let presetUrl = '';
    if (presetType === 'localhost') {
      presetUrl = 'http://localhost:5000/api';
    } else if (presetType === 'local-wifi') {
      const ip = window.prompt("Enter your PC's IP address (e.g. 192.168.1.100):", "192.168.1.");
      if (ip) {
        presetUrl = `http://${ip.trim()}:5000/api`;
      } else {
        return;
      }
    }
    setApiUrl(presetUrl);
    setTestStatus(null);
    setTestMessage('');
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content glass-modal animate-slide-up">
        <div className="modal-header">
          <h2>⚙️ Connection Settings</h2>
          <button onClick={onClose} className="close-button">×</button>
        </div>
        <div className="modal-form">
          <p className="settings-desc">
            Configure your backend API URL to use the app on other devices like your phone!
          </p>
          
          <div className="form-group">
            <label>Backend API URL</label>
            <input
              type="text"
              value={apiUrl}
              onChange={(e) => {
                setApiUrl(e.target.value);
                setTestStatus(null);
                setTestMessage('');
              }}
              placeholder="e.g. http://localhost:5000/api or https://your-backend.onrender.com/api"
              className="settings-input"
            />
          </div>

          <div className="preset-buttons">
            <button type="button" onClick={() => handleUsePreset('localhost')} className="btn-preset">
              💻 Local PC
            </button>
            <button type="button" onClick={() => handleUsePreset('local-wifi')} className="btn-preset">
              📶 Wi-Fi Access
            </button>
          </div>

          <div className="test-connection-section">
            <button 
              type="button" 
              onClick={handleTestConnection} 
              className={`btn-test ${testStatus === 'testing' ? 'testing' : ''}`}
              disabled={testStatus === 'testing'}
            >
              ⚡ Test Connection
            </button>
            {testMessage && (
              <div className={`test-result-box ${testStatus}`}>
                {testMessage}
              </div>
            )}
          </div>

          <div className="modal-actions settings-actions">
            <button 
              type="button" 
              onClick={handleSave} 
              className="btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : '💾 Save & Apply'}
            </button>
            <button 
              type="button" 
              onClick={handleReset} 
              className="btn-secondary btn-reset-link"
            >
              🔄 Reset to Default
            </button>
            <button 
              type="button" 
              onClick={onClose} 
              className="btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
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
  const [showSettings, setShowSettings] = useState(false);

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
        member.phone.includes(searchTerm);
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
        {toast && (
          <Toast 
            message={toast.message} 
            type={toast.type} 
            onClose={() => setToast(null)} 
          />
        )}
        <div className="error-container glass-card">
          <div className="error-icon">⚠️</div>
          <h2>Connection Error</h2>
          <p>{error}</p>
          <p className="error-help">
            Could not connect to the backend server. If you are using a mobile phone, verify that your backend server is running and your API URL settings are correct.
          </p>
          <div className="error-actions">
            <button onClick={refreshData} className="btn-primary">
              🔄 Try Again
            </button>
            <button onClick={() => setShowSettings(true)} className="btn-secondary">
              ⚙️ Connection Settings
            </button>
          </div>
        </div>

        {showSettings && (
          <SettingsModal
            onClose={() => setShowSettings(false)}
            onShowToast={showToast}
          />
        )}
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

      <header className="app-header glass-header">
        <div className="header-content">
          <div className="header-title-row">
            <h1>💪 Gym Management System</h1>
            <button 
              onClick={() => setShowSettings(true)} 
              className="btn-settings-toggle"
              title="Connection Settings"
            >
              ⚙️
            </button>
          </div>
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
        
        <div className="members-section glass-card">
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

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          onShowToast={showToast}
        />
      )}
    </div>
  );
};

export default Gym;