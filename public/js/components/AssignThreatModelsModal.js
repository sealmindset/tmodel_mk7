/**
 * AssignThreatModelsModal.js
 * Modal component for assigning threat models to a project
 */

class AssignThreatModelsModal extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      availableThreatModels: [],
      selectedIds: [],
      searchQuery: '',
      isLoading: true,
      error: null,
      isSubmitting: false
    };
  }

  componentDidMount() {
    this.fetchAvailableThreatModels();
    
    // Initialize Bootstrap modal
    this.modal = new bootstrap.Modal(document.getElementById('assignThreatModelsModal'));
    this.modal.show();
    
    // Add event listener for modal close
    document.getElementById('assignThreatModelsModal').addEventListener('hidden.bs.modal', this.props.onClose);
  }
  
  componentWillUnmount() {
    // Remove event listener and destroy modal
    document.getElementById('assignThreatModelsModal').removeEventListener('hidden.bs.modal', this.props.onClose);
    this.modal.dispose();
  }

  fetchAvailableThreatModels = async () => {
    this.setState({ isLoading: true, error: null });
    try {
      // Get all threat models
      const response = await fetch('/api/threat-models');
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Filter out already assigned ones
      const currentIds = this.props.currentThreatModels.map(tm => tm.id);
      const available = (data.data || []).filter(tm => !currentIds.includes(tm.id));
      
      this.setState({ 
        availableThreatModels: available, 
        isLoading: false 
      });
    } catch (error) {
      console.error('Error fetching available threat models:', error);
      this.setState({ 
        error: 'Failed to load available threat models. Please try again later.', 
        isLoading: false 
      });
    }
  };

  handleToggleSelect = (id) => {
    this.setState(prevState => {
      const selectedIds = [...prevState.selectedIds];
      const index = selectedIds.indexOf(id);
      
      if (index === -1) {
        selectedIds.push(id);
      } else {
        selectedIds.splice(index, 1);
      }
      
      return { selectedIds };
    });
  };

  handleSearchChange = (e) => {
    this.setState({ searchQuery: e.target.value });
  };

  handleAssign = async () => {
    const { selectedIds } = this.state;
    
    if (selectedIds.length === 0) {
      toastr.warning('Please select at least one threat model to assign');
      return;
    }
    
    this.setState({ isSubmitting: true });
    
    try {
      const response = await fetch(`/api/projects/${this.props.projectId}/threat-models`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ threatModelIds: selectedIds })
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const result = await response.json();
      
      // Show success message
      toastr.success(result.message || `Successfully assigned ${selectedIds.length} threat model(s) to project`);
      
      // Close modal and refresh list
      this.modal.hide();
      this.props.onComplete();
    } catch (error) {
      console.error('Error assigning threat models:', error);
      toastr.error('Failed to assign threat models');
      this.setState({ isSubmitting: false });
    }
  };

  getFilteredThreatModels() {
    const { availableThreatModels, searchQuery } = this.state;
    
    if (!searchQuery.trim()) {
      return availableThreatModels;
    }
    
    const query = searchQuery.toLowerCase();
    return availableThreatModels.filter(tm => 
      (tm.title && tm.title.toLowerCase().includes(query)) ||
      (tm.description && tm.description.toLowerCase().includes(query))
    );
  }

  render() {
    const { isLoading, error, selectedIds, searchQuery, isSubmitting } = this.state;
    const filteredThreatModels = this.getFilteredThreatModels();
    
    return (
      <div className="modal fade" id="assignThreatModelsModal" tabIndex="-1" aria-labelledby="assignThreatModelsModalLabel" aria-hidden="true">
        <div className="modal-dialog modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title" id="assignThreatModelsModalLabel">Assign Threat Models to Project</h5>
              <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div className="modal-body">
              <div className="mb-3">
                <input
                  type="text"
                  className="form-control"
                  placeholder="Search threat models..."
                  value={searchQuery}
                  onChange={this.handleSearchChange}
                />
              </div>
              
              {isLoading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-primary" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                  <p className="mt-2">Loading threat models...</p>
                </div>
              ) : error ? (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              ) : filteredThreatModels.length === 0 ? (
                <div className="alert alert-info" role="alert">
                  {searchQuery ? 'No threat models match your search.' : 'No available threat models found.'}
                </div>
              ) : (
                <div className="list-group">
                  {filteredThreatModels.map(tm => (
                    <div key={tm.id} className="list-group-item list-group-item-action d-flex align-items-start">
                      <div className="form-check me-3 mt-1">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`tm-${tm.id}`}
                          checked={selectedIds.includes(tm.id)}
                          onChange={() => this.handleToggleSelect(tm.id)}
                        />
                        <label className="form-check-label visually-hidden" htmlFor={`tm-${tm.id}`}>
                          Select {tm.title || 'Untitled Threat Model'}
                        </label>
                      </div>
                      <div className="flex-grow-1">
                        <h5 className="mb-1">{tm.title || 'Untitled Threat Model'}</h5>
                        <p className="mb-1 text-muted small">
                          Created: {new Date(tm.created_at).toLocaleDateString()}
                          {tm.status && (
                            <span className="badge bg-secondary ms-2">{tm.status}</span>
                          )}
                        </p>
                        {tm.description && (
                          <p className="mb-0 small">{tm.description}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <div className="d-flex justify-content-between w-100">
                <div>
                  <span className="badge bg-primary">
                    {selectedIds.length} selected
                  </span>
                </div>
                <div>
                  <button 
                    type="button" 
                    className="btn btn-secondary me-2" 
                    data-bs-dismiss="modal"
                  >
                    Cancel
                  </button>
                  <button 
                    type="button" 
                    className="btn btn-primary"
                    onClick={this.handleAssign}
                    disabled={selectedIds.length === 0 || isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Assigning...
                      </>
                    ) : (
                      <>Assign Selected</>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}

// Export the component
window.AssignThreatModelsModal = AssignThreatModelsModal;

// Register the component with the component loader
if (window.ComponentLoader) {
  window.ComponentLoader.registerComponent('AssignThreatModelsModal', AssignThreatModelsModal);
}
