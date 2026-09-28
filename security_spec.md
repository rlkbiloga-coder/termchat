# Security Specification: TermChat Firestore ABAC Rules

## 1. Data Invariants
- Todos os recursos (perfis, histórico de chat, configurações do projeto e arquivos de workspace) pertencem a um usuário autenticado identificado pelo path `/users/{userId}`.
- O acesso a qualquer subcoleção (`chat_messages`, `project_settings`, `workspace_files`) é estritamente restrito ao proprietário do documento pai cujo UID corresponde a `request.auth.uid`.
- Os IDs de documentos devem aderir ao padrão `isValidId` (`^[a-zA-Z0-9_-]+$` com tamanho <= 128 caracteres) para prevenir ID poisoning.
- Strings possuem limites estritos de tamanho (.size()) para evitar ataques de esgotamento de recursos e denial-of-wallet.
- Nenhum usuário pode ler ou escrever dados de outro usuário. A leitura de listas avalia o contexto estrito do usuário autenticado.

## 2. The "Dirty Dozen" Payloads (Denial Test Cases)
1. **Unauthenticated Read on User Profile**: `GET /users/user123` sem auth -> PERMISSION_DENIED
2. **Cross-User Profile Update**: User A tentando atualizar `/users/userB` -> PERMISSION_DENIED
3. **Ghost Field Injection in Chat**: User A enviando campo malicioso `isAdmin: true` no chat -> PERMISSION_DENIED
4. **Oversized Message Content**: User A enviando mensagem com > 65536 caracteres -> PERMISSION_DENIED
5. **ID Poisoning Attack**: User A enviando path variable com 2KB de caracteres lixo -> PERMISSION_DENIED
6. **Cross-User Chat Reading**: User A tentando ler mensagens em `/users/userB/chat_messages` -> PERMISSION_DENIED
7. **Identity Spoofing in Setting**: User A criando `project_settings` com `userId: 'userB'` -> PERMISSION_DENIED
8. **Unverified Email Modification**: Tentativa de escrita com `email_verified == false` -> PERMISSION_DENIED
9. **Oversized Workspace File Payload**: Tentativa de salvar arquivo > 262144 bytes -> PERMISSION_DENIED
10. **Blanket Query Scraping**: Consulta em subcoleções sem restrição de proprietário -> PERMISSION_DENIED
11. **Malicious Role Injection**: Tentativa de auto-atribuição de papel administrativo -> PERMISSION_DENIED
12. **Cross-Tenant File Modification**: User A atualizando `/users/userB/workspace_files/file1` -> PERMISSION_DENIED
