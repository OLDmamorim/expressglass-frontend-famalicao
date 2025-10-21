// admin-script.js - Lógica do painel administrativo (SIMPLIFICADO - sem localidades)
// Version: 1.1.0 - Funcional sem autenticação (temporário)

let editingPortalId = null;
let editingUserId = null;

// ===== INICIALIZAÇÃO =====
(async () => {
  try {
    console.log('Inicializando painel administrativo...');
    
    // Verificar autenticação
    if (!authClient.isAuthenticated()) {
      console.log('Não autenticado - redirecionando para login');
      window.location.href = '/login.html';
      return;
    }

    const result = await authClient.verifyAuth();
    
    if (!result.success || !authClient.isAdmin()) {
      console.log('Acesso negado - não é admin');
      alert('Acesso negado: apenas administradores podem aceder a esta página');
      authClient.logout();
      window.location.href = '/login.html';
      return;
    }
    
    // Exibir nome do utilizador
    const currentUserName = authClient.user ? authClient.user.username : 'Admin';
    document.getElementById('currentUser').textContent = `${currentUserName} (${authClient.user.role})`;

    console.log('Carregando dados...');
    // Carregar dados
    loadPortals();
    loadUsers();
    loadPortalsForSelect();
  } catch (error) {
    console.error('Erro na inicialização:', error);
    alert('Erro ao inicializar painel: ' + error.message);
  }

  // Event listeners
  setupEventListeners();
})();

// ===== EVENT LISTENERS =====
function setupEventListeners() {
  // Tabs
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // Logout
  document.getElementById('btnLogout').addEventListener('click', () => {
    authClient.logout();
    window.location.href = '/login.html';
  });

  // Botões de criar
  document.getElementById('btnNewPortal').addEventListener('click', openNewPortalModal);
  document.getElementById('btnNewUser').addEventListener('click', openNewUserModal);

  // Formulários
  document.getElementById('portalForm').addEventListener('submit', handlePortalSubmit);
  document.getElementById('userForm').addEventListener('submit', handleUserSubmit);

  // Role select - mostrar/esconder portal
  document.getElementById('userRole').addEventListener('change', (e) => {
    const portalGroup = document.getElementById('portalSelectGroup');
    if (e.target.value === 'admin') {
      portalGroup.style.display = 'none';
      document.getElementById('userPortal').removeAttribute('required');
    } else {
      portalGroup.style.display = 'block';
      document.getElementById('userPortal').setAttribute('required', 'required');
    }
  });
}

// ===== TABS =====
function switchTab(tabName) {
  // Atualizar botões
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Atualizar conteúdo
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.toggle('active', content.id === `tab-${tabName}`);
  });
}

// ===== PORTAIS =====
async function loadPortals() {
  const tbody = document.getElementById('portalsTableBody');
  tbody.innerHTML = '<tr><td colspan="5" class="loading">A carregar...</td></tr>';

  try {
    // TEMPORÁRIO: Usar fetch normal enquanto autenticação está desativada
    const response = await authClient.authenticatedFetch(`${authClient.baseURL}/portals`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    if (data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#6b7280;">Nenhum portal encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = data.data.map(portal => `
      <tr>
        <td>${portal.id}</td>
        <td><strong>${portal.name}</strong></td>
        <td>${portal.user_count || 0}</td>
        <td>${new Date(portal.created_at).toLocaleDateString('pt-PT')}</td>
        <td class="actions-cell">
          <button class="btn-edit" onclick="editPortal(${portal.id}, '${portal.name}')">Editar</button>
          <button class="btn-delete" onclick="deletePortal(${portal.id}, '${portal.name}')">Eliminar</button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Erro ao carregar portais:', error);
    showToast('Erro ao carregar portais', 'error');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#ef4444;">Erro ao carregar dados</td></tr>';
  }
}

function openNewPortalModal() {
  editingPortalId = null;
  document.getElementById('portalModalTitle').textContent = 'Novo Portal';
  document.getElementById('portalName').value = '';
  openModal('portalModal');
}

function editPortal(id, name) {
  editingPortalId = id;
  document.getElementById('portalModalTitle').textContent = 'Editar Portal';
  document.getElementById('portalName').value = name;
  openModal('portalModal');
}

async function handlePortalSubmit(e) {
  e.preventDefault();

  const name = document.getElementById('portalName').value.trim();

  if (!name) {
    showToast('Nome do portal é obrigatório', 'error');
    return;
  }

  const portalData = { name };

  try {
    const url = editingPortalId 
      ? `${authClient.baseURL}/portals/${editingPortalId}`
      : `${authClient.baseURL}/portals`;
    
    const method = editingPortalId ? 'PUT' : 'POST';

    const response = await authClient.authenticatedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(portalData)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    showToast(editingPortalId ? 'Portal atualizado com sucesso' : 'Portal criado com sucesso', 'success');
    closeModal('portalModal');
    loadPortals();
    loadPortalsForSelect();

  } catch (error) {
    console.error('Erro ao guardar portal:', error);
    showToast(error.message || 'Erro ao guardar portal', 'error');
  }
}

async function deletePortal(id, name) {
  if (!confirm(`Tem certeza que deseja eliminar o portal "${name}"?\n\nEsta ação não pode ser desfeita.`)) {
    return;
  }

  try {
    const response = await authClient.authenticatedFetch(`${authClient.baseURL}/portals/${id}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    showToast('Portal eliminado com sucesso', 'success');
    loadPortals();
    loadPortalsForSelect();

  } catch (error) {
    console.error('Erro ao eliminar portal:', error);
    showToast(error.message || 'Erro ao eliminar portal', 'error');
  }
}

// ===== UTILIZADORES =====
async function loadUsers() {
  const tbody = document.getElementById('usersTableBody');
  tbody.innerHTML = '<tr><td colspan="6" class="loading">A carregar...</td></tr>';

  try {
    const response = await authClient.authenticatedFetch(`${authClient.baseURL}/users`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    if (data.data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#6b7280;">Nenhum utilizador encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = data.data.map(user => `
      <tr>
        <td>${user.id}</td>
        <td><strong>${user.username}</strong></td>
        <td>${user.portalName || '<em>Nenhum</em>'}</td>
        <td><span class="badge badge-${user.role}">${user.role === 'admin' ? 'Admin' : 'User'}</span></td>
        <td>${new Date(user.createdAt).toLocaleDateString('pt-PT')}</td>
        <td class="actions-cell">
          <button class="btn-edit" onclick="editUser(${user.id})">Editar</button>
          <button class="btn-delete" onclick="deleteUser(${user.id})">Eliminar</button>
        </td>
      </tr>
    `).join('');

  } catch (error) {
    console.error('Erro ao carregar utilizadores:', error);
    showToast('Erro ao carregar utilizadores', 'error');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#ef4444;">Erro ao carregar dados</td></tr>';
  }
}

async function loadPortalsForSelect() {
  const select = document.getElementById('userPortal');
  
  try {
    const response = await authClient.authenticatedFetch(`${authClient.baseURL}/portals`);
    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    select.innerHTML = '<option value="">Selecione um portal</option>' +
      data.data.map(portal => `<option value="${portal.id}">${portal.name}</option>`).join('');

  } catch (error) {
    console.error('Erro ao carregar portais:', error);
    select.innerHTML = '<option value="">Erro ao carregar portais</option>';
  }
}

function openNewUserModal() {
  editingUserId = null;
  document.getElementById('userModalTitle').textContent = 'Novo Utilizador';
  document.getElementById('userUsername').value = '';
  document.getElementById('userPassword').value = '';
  document.getElementById('userPassword').setAttribute('required', 'required');
  document.getElementById('userRole').value = 'user';
  document.getElementById('userPortal').value = '';
  document.getElementById('portalSelectGroup').style.display = 'block';
  openModal('userModal');
}

async function editUser(userId) {
  try {
    // TEMPORÁRIO: Usar fetch normal enquanto autenticação está desativada
    const response = await authClient.authenticatedFetch(`${authClient.baseURL}/users`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    
    const user = data.data.find(u => u.id === userId);
    if (!user) throw new Error('Utilizador não encontrado');
    
    editingUserId = user.id;
    document.getElementById('userModalTitle').textContent = 'Editar Utilizador';
    document.getElementById('userUsername').value = user.username;
    document.getElementById('userPassword').value = '';
    document.getElementById('userPassword').removeAttribute('required');
    document.getElementById('userRole').value = user.role;
    document.getElementById('userPortal').value = user.portalId || '';
    
    if (user.role === 'admin') {
      document.getElementById('portalSelectGroup').style.display = 'none';
    } else {
      document.getElementById('portalSelectGroup').style.display = 'block';
    }
    
    openModal('userModal');
  } catch (error) {
    console.error('Erro ao carregar utilizador:', error);
    showToast('Erro ao carregar utilizador', 'error');
  }
}

async function handleUserSubmit(e) {
  e.preventDefault();

  const username = document.getElementById('userUsername').value.trim();
  const password = document.getElementById('userPassword').value;
  const role = document.getElementById('userRole').value;
  const portalId = document.getElementById('userPortal').value;

  if (!username) {
    showToast('Username é obrigatório', 'error');
    return;
  }

  if (!editingUserId && !password) {
    showToast('Password é obrigatória para novos utilizadores', 'error');
    return;
  }

  if (role !== 'admin' && !portalId) {
    showToast('Utilizadores normais devem ter um portal atribuído', 'error');
    return;
  }

  const userData = {
    username,
    role,
    portal_id: role === 'admin' ? null : parseInt(portalId)
  };

  if (password) {
    userData.password = password;
  }

  try {
    const url = editingUserId 
      ? `${authClient.baseURL}/users/${editingUserId}`
      : `${authClient.baseURL}/users`;
    
    const method = editingUserId ? 'PUT' : 'POST';

    const response = await authClient.authenticatedFetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    showToast(editingUserId ? 'Utilizador atualizado com sucesso' : 'Utilizador criado com sucesso', 'success');
    closeModal('userModal');
    loadUsers();

  } catch (error) {
    console.error('Erro ao guardar utilizador:', error);
    showToast(error.message || 'Erro ao guardar utilizador', 'error');
  }
}

async function deleteUser(id) {
  try {
    // TEMPORÁRIO: Usar fetch normal enquanto autenticação está desativada
    const response = await authClient.authenticatedFetch(`${authClient.baseURL}/users`);
    const data = await response.json();
    if (!data.success) throw new Error(data.error);
    
    const user = data.data.find(u => u.id === id);
    const username = user ? user.username : 'este utilizador';
    
    if (!confirm(`Tem certeza que deseja eliminar o utilizador "${username}"?\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }
  } catch (error) {
    console.error('Erro ao carregar utilizador:', error);
    if (!confirm(`Tem certeza que deseja eliminar este utilizador?\n\nEsta ação não pode ser desfeita.`)) {
      return;
    }
  }

  try {
    const response = await authClient.authenticatedFetch(`${authClient.baseURL}/users/${id}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error);
    }

    showToast('Utilizador eliminado com sucesso', 'success');
    loadUsers();

  } catch (error) {
    console.error('Erro ao eliminar utilizador:', error);
    showToast(error.message || 'Erro ao eliminar utilizador', 'error');
  }
}

// ===== MODAL =====
function openModal(modalId) {
  document.getElementById(modalId).classList.add('show');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.remove('show');
}

// ===== TOAST =====
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

