# MENDES — Calls e transmissão de tela

Site de voz WebRTC com visual preto/vermelho, convites individuais, salas criadas pelo dono `mendesxk`, painel de moderação e compartilhamento de tela.

## Rodar localmente

1. Instale Node.js 20+.
2. Abra um terminal nesta pasta e rode `npm install`.
3. Configure uma variável de ambiente `ADMIN_PASSWORD` com **12+ caracteres** (NÃO coloque a senha no código ou no GitHub). Configure também `SESSION_SECRET` com uma chave aleatória.
4. Rode `npm start` e abra `http://localhost:3000`.
5. Entre com apelido `mendesxk` e a senha do dono. Gere códigos no painel para seus amigos.

No PowerShell, para teste local:
```powershell
$env:ADMIN_PASSWORD="SUA_SENHA_FORTE_AQUI"
$env:SESSION_SECRET="OUTRA_CHAVE_SECRETA_GRANDE"
npm install
npm start
```

## Publicar no Render

- Envie os **arquivos extraídos** deste ZIP para seu repositório GitHub (não envie `.env` nem `mendes-data.json`).
- Render > New > Web Service > conecte o repositório.
- Runtime: Node; Build Command: `npm install`; Start Command: `npm start`.
- Em Environment, crie `ADMIN_PASSWORD` e `SESSION_SECRET` com valores fortes e diferentes.
- Acesse o endereço HTTPS gerado.

**IMPORTANTE — armazenamento:** os convites, bans e salas são salvos em `mendes-data.json`. No Render gratuito, o sistema de arquivos pode ser apagado em reinicializações/deploys. Para uso real, configure armazenamento persistente externo (por exemplo banco PostgreSQL) antes de distribuir convites; não confie neste armazenamento temporário para manter bans e convites. Também não use múltiplas instâncias com este armazenamento.

**Limites técnicos:** a chamada é WebRTC em malha P2P com STUN público. Para funcionar em todas as redes, precisa de um serviço TURN com credenciais, que não está configurado nesta versão. A versão é indicada para grupos pequenos. Compartilhar tela no celular depende do navegador e do sistema; assistir transmissões pode funcionar. Em produção, HTTPS é obrigatório para microfone/tela. O banimento nesta versão é por apelido, não uma identidade verificada, então não impede um usuário de retornar com outro apelido e novo convite. O dono tem senha, os demais usam convite de uso único. O painel e as ações são autorizados no servidor.

**Segurança:** não exponha senhas no GitHub; não há recuperação de conta, auditoria ou sistema de identidade forte para convidados. Antes de uso público amplo, acrescente persistência robusta, autenticação de usuários e TURN.
