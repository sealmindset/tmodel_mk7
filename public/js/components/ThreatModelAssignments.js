/**
 * ThreatModelAssignments.js
 * Component for managing threat model assignments to a project
 */

class ThreatModelAssignments extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      threatModels: [],
      isLoading: true,
      error: null,
      showAssignModal: false
    };
  }

  componentDidMount() {
    this.fetchThreatModels();
    
    // Add event listener for external button clicks
    const container = document.getElementById('threatModelAssignmentsContainer');
    if (container) {
      container.addEventListener('openAssignModal', this.openAssignModal);
      // Store reference to this component instance
      container.__reactRoot = true;
    }
  }
  
  componentWillUnmount() {
    // Remove event listener when component unmounts
    const container = document.getElementById('threatModelAssignmentsContainer');
    if (container) {
      container.removeEventListener('openAssignModal', this.openAssignModal);
      container.__reactRoot = false;
    }
  }

  fetchThreatModels = async () => {
    this.setState({ isLoading: true, error: null });
    try {
      const response = await fetch(`/api/projects/${this.props.projectId}/threat-models`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      this.setState({ 
        threatModels: data.data || [], 
        isLoading: false 
      });
    } catch (error) {
      console.error('Error fetching threat models:', error);
      this.setState({ 
        error: 'Failed to load threat models. Please try again later.', 
        isLoading: false 
      });
    }
  };

  handleRemoveThreatModel = async (threatModelId) => {
    if (!confirm('Are you sure you want to remove this threat model from the project?')) {
      return;
    }

    try {
      const response = await fetch(`/api/projects/${this.props.projectId}/threat-models/${threatModelId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      // Show success message
      toastr.success('Threat model removed from project successfully');
      
      // Refresh the list
      this.fetchThreatModels();
    } catch (error) {
      console.error('Error removing threat model:', error);
      toastr.error('Failed to remove threat model');
    }
  };

  openAssignModal = () => {
    this.setState({ showAssignModal: true });
  };

  closeAssignModal = () => {
    this.setState({ showAssignModal: false });
  };

  handleAssignComplete = () => {
    this.closeAssignModal();
    this.fetchThreatModels();
  };

  renderThreatModelsList() {
    const { threatModels, isLoading, error } = this.state;

    if (isLoading) {
      return (
        <div className="text-center py-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading threat models...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      );
    }

    if (threatModels.length === 0) {
      return (
        <div className="alert alert-info" role="alert">
          No threat models are currently assigned to this project.
          <button 
            className="btn btn-sm btn-primary ms-3"
            onClick={this.openAssignModal}
          >
            Assign Threat Models
          </button>
        </div>
      );
    }

    return (
      <div className="table-responsive">
        <table className="table table-striped table-hover">
          <thead>
            <tr>
              <th>Title</th>
              <th>Created</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {threatModels.map(model => (
              <tr key={model.id}>
                <td>
                  <a href={`/threat-models/${model.id}`}>
                    {model.title || 'Untitled Threat Model'}
                  </a>
                </td>
                <td>{new Date(model.created_at).toLocaleDateString()}</td>
                <td>
                  <span className={`badge bg-${this.getStatusClass(model.status)}`}>
                    {model.status || 'Draft'}
                  </span>
                </td>
                <td>
                  <div className="btn-group btn-group-sm">
                    <a 
                      href={`/threat-models/${model.id}`} 
                      className="btn btn-outline-primary"
                      title="View Threat Model"
                    >
                      <i className="bi bi-eye"></i>
                    </a>
                    <button
                      className="btn btn-outline-danger"
                      onClick={() => this.handleRemoveThreatModel(model.id)}
                      title="Remove from Project"
                    >
                      <i className="bi bi-unlink"></i>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  getStatusClass(status) {
    switch(status) {
      case 'Active': return 'success';
      case 'Draft': return 'secondary';
      case 'In Review': return 'info';
      case 'Approved': return 'primary';
      case 'Deprecated': return 'warning';
      default: return 'secondary';
    }
  }

  render() {
    return (
      <div className="threat-models-container">
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h3 className="mb-0">Assigned Threat Models</h3>
          <button 
            className="btn btn-primary"
            onClick={this.openAssignModal}
          >
            <i className="bi bi-link me-1"></i>
            Assign Threat Models
          </button>
        </div>

        {this.renderThreatModelsList()}

        {this.state.showAssignModal && (
          <AssignThreatModelsModal
            projectId={this.props.projectId}
            currentThreatModels={this.state.threatModels}
            onClose={this.closeAssignModal}
            onComplete={this.handleAssignComplete}
          />
        )}
      </div>
    );
  }
}

// Export the component
window.ThreatModelAssignments = ThreatModelAssignments;

// Register the component with the component loader
if (window.ComponentLoader) {
  window.ComponentLoader.registerComponent('ThreatModelAssignments', ThreatModelAssignments);
}
