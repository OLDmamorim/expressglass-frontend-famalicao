# Frontend Staging - Sistema Multi-Tenant

## 🚀 Novidades nesta Branch

Esta branch `staging` implementa o sistema de autenticação multi-tenant para o Expressglass Famalicão.

### Novos Ficheiros

- `auth-client.js` - Cliente de autenticação (localStorage + JWT)
- `login.html` - Página de login (sem logo, sem credenciais)
- `admin.html` - Painel administrativo
- `admin-script.js` - Lógica do painel admin
- `admin-style.css` - Estilos do painel admin

### Fluxo de Autenticação

1. **Acesso inicial:** Redireciona para `/login.html`
2. **Login:**
   - Admin → `/admin.html` (painel administrativo)
   - User → `/index.html` (calendário de agendamentos)
3. **Verificação:** Todas as páginas verificam autenticação ao carregar

### Páginas

#### `/login.html`
- Login com username e password
- Redirecionamento automático baseado no role
- Design limpo sem credenciais expostas

#### `/admin.html` (Admin apenas)
- **Aba Portais:** Criar, editar e eliminar portais
- **Aba Utilizadores:** Criar, editar e eliminar utilizadores
- Interface moderna com modais e toasts

#### `/index.html` (User)
- Calendário de agendamentos (existente)
- Filtrado automaticamente por portal do utilizador
- Apenas dados do portal atribuído são visíveis

### Integração com Backend

O frontend comunica com as seguintes APIs:

```javascript
// Autenticação
POST /.netlify/functions/auth-login
GET  /.netlify/functions/auth-verify

// Portais (Admin)
GET    /.netlify/functions/portals
POST   /.netlify/functions/portals
PUT    /.netlify/functions/portals/:id
DELETE /.netlify/functions/portals/:id

// Utilizadores (Admin)
GET    /.netlify/functions/users
POST   /.netlify/functions/users
PUT    /.netlify/functions/users/:id
DELETE /.netlify/functions/users/:id

// Agendamentos (User)
GET    /.netlify/functions/appointments (filtrado por portal_id)
```

### Credenciais Iniciais

**Admin Master:**
- Username: `admin`
- Password: `admin123`

⚠️ **IMPORTANTE:** Alterar a password após primeiro login!

### Armazenamento Local

O sistema usa `localStorage` para persistir:
- `eg_auth_token` - Token JWT
- `eg_auth_user` - Dados do utilizador (JSON)

### Segurança

- ✅ Token JWT com expiração de 7 dias
- ✅ Verificação automática em todas as páginas
- ✅ Logout automático se token inválido
- ✅ Redirecionamento baseado em permissões

### Testes

1. **Login Admin:**
   - Aceder `/login.html`
   - Login: `admin` / `admin123`
   - Deve redirecionar para `/admin.html`

2. **Criar Portal:**
   - No admin, aba "Portais"
   - Clicar "Novo Portal"
   - Nome: "Famalicão"
   - Guardar

3. **Criar Utilizador:**
   - Aba "Utilizadores"
   - Clicar "Novo Utilizador"
   - Preencher dados
   - Atribuir portal
   - Guardar

4. **Login User:**
   - Logout
   - Login com utilizador criado
   - Deve redirecionar para `/index.html`
   - Vê apenas dados do seu portal

### Próximos Passos

⚠️ **IMPORTANTE:** Esta branch ainda não integra a autenticação no `index.html` existente.

Para completar a integração:

1. Adicionar verificação de autenticação no `index.html`
2. Atualizar `script.js` para filtrar por `portal_id`
3. Adicionar header `Authorization` nas chamadas API

Ver `GUIA_IMPLEMENTACAO.md` para detalhes.

### Deploy

Esta branch será automaticamente deployada no Netlify quando fizer push.

---

**Desenvolvido para Expressglass Famalicão** 🚗💎

