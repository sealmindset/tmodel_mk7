document.addEventListener('DOMContentLoaded', function() {
  // Archive project button
  document.querySelectorAll('.archive-project-btn').forEach(btn => {
    btn.addEventListener('click', async function() {
      const projectId = this.getAttribute('data-project-id');
      const projectName = this.getAttribute('data-project-name');
      if (confirm(`Archive project "${projectName}"?`)) {
        try {
          const res = await fetch(`/api/projects/${projectId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'Archived' })
          });
          const data = await res.json();
          if (data.success) {
            alert(`Project "${projectName}" archived.`);
            window.location.reload();
          } else {
            alert(`Error archiving project: ${data.error}`);
          }
        } catch (err) {
          console.error('Error archiving project:', err);
          alert(`Error archiving project: ${err.message}`);
        }
      }
    });
  });

  // Delete project modal handling
  let projectIdToDelete = null;
  const deleteModalElem = document.getElementById('deleteConfirmModal');
  const deleteModal = new bootstrap.Modal(deleteModalElem);
  const deleteProjectNameSpan = document.getElementById('deleteProjectName');
  document.querySelectorAll('.delete-project-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      projectIdToDelete = this.getAttribute('data-project-id');
      const projectName = this.getAttribute('data-project-name');
      deleteProjectNameSpan.textContent = projectName;
      deleteModal.show();
    });
  });

  document.getElementById('confirmDeleteProject').addEventListener('click', async function() {
    if (!projectIdToDelete) return;
    try {
      const res = await fetch(`/api/projects/${projectIdToDelete}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        deleteModal.hide();
        alert('Project deleted.');
        window.location.reload();
      } else {
        alert(`Error deleting project: ${data.error}`);
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      alert(`Error deleting project: ${err.message}`);
    }
  });
});
