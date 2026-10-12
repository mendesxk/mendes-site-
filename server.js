import express from 'express';
import http from 'node:http';
import { Server } from 'socket.io';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const app=express();app.disable('x-powered-by');app.use(express.json({limit:'20kb'}));
const server=http.createServer(app);const io=new Server(server,{maxHttpBufferSize:2e5});
const PORT=process.env.PORT||3000;
const SECRET=process.env.ADMIN_PASSWORD;
if(!SECRET||SECRET.length<12){console.error('Configure ADMIN_PASSWORD (mínimo 12 caracteres) nas variáveis de ambiente antes de iniciar.');process.exit(1)}
const KEY=process.env.SESSION_SECRET||crypto.randomBytes(32).toString('hex');
const DATA=process.env.DATA_FILE||path.join(process.cwd(),'mendes-data.json');
let db={rooms:[{id:'geral',name:'Call Geral'},{id:'privada',name:'Call Privada'}],invites:[],bans:[]};
try{db={...db,...JSON.parse(fs.readFileSync(DATA,'utf8'))}}catch{}
const save=()=>{const temp=DATA+'.tmp';fs.writeFileSync(temp,JSON.stringify(db,null,2));fs.renameSync(temp,DATA)};
const sessions=new Map(),users=new Map(),attempts=new Map();
const clean=(v,max=32)=>String(v??'').trim().slice(0,max);
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
const code=()=>crypto.randomBytes(9).toString('base64url').toUpperCase();
function rate(ip){let x=attempts.get(ip)||{count:0,until:0};if(Date.now()>x.until)x={count:0,until:Date.now()+60000};x.count++;attempts.set(ip,x);return x.count<=12}
function session(req){const t=req.headers.authorization?.replace(/^Bearer /,'');return t&&sessions.get(t)}
function auth(req,res,next){req.user=session(req);if(!req.user)return res.status(401).json({error:'Entre novamente.'});next()}
function admin(req,res,next){if(!req.user?.admin)return res.status(403).json({error:'Apenas o dono.'});next()}
function view(){return {rooms:db.rooms.map(r=>({...r,users:[...users.values()].filter(u=>u.room===r.id).map(u=>({id:u.id,name:u.name,muted:u.muted,sharing:u.sharing,admin:u.admin}))})),online:users.size}}
function broadcast(){io.emit('state',view())}
app.post('/api/login',(req,res)=>{const ip=req.ip;if(!rate(ip))return res.status(429).json({error:'Aguarde um minuto.'});const name=clean(req.body.name);const invite=clean(req.body.invite,60);const password=String(req.body.password||'');const isAdmin=name.toLowerCase()==='mendesxk'&&password&&crypto.timingSafeEqual(Buffer.from(hash(password)),Buffer.from(hash(SECRET)));
if(!name||name.length<2)return res.status(400).json({error:'Apelido deve ter pelo menos 2 letras.'});
if(name.toLowerCase()==='mendesxk'&&!isAdmin)return res.status(403).json({error:'Nome reservado para o dono. Informe a senha correta.'});
if(!isAdmin){const item=db.invites.find(i=>i.hash===hash(invite)&&!i.used&&!i.revoked);if(!item)return res.status(403).json({error:'Convite inválido ou já utilizado.'});if(db.bans.includes(name.toLowerCase()))return res.status(403).json({error:'Apelido banido.'});item.used=true;item.usedBy=name;item.usedAt=Date.now();save()}
const token=crypto.randomBytes(32).toString('hex');sessions.set(token,{name,admin:isAdmin,created:Date.now()});res.json({token,name,admin:isAdmin})});
app.get('/api/me',auth,(req,res)=>res.json(req.user));
app.get('/api/state',auth,(req,res)=>res.json(view()));
app.get('/api/invites',auth,admin,(req,res)=>res.json(db.invites.map(({hash,...x})=>x)));
app.post('/api/invites',auth,admin,(req,res)=>{const raw=code();const invite={id:crypto.randomUUID(),hash:hash(raw),used:false,revoked:false,createdAt:Date.now()};db.invites.push(invite);save();res.json({code:raw,invite:{id:invite.id}})});
app.delete('/api/invites/:id',auth,admin,(req,res)=>{const i=db.invites.find(x=>x.id===req.params.id);if(!i)return res.sendStatus(404);i.revoked=true;save();res.json({ok:true})});
app.post('/api/rooms',auth,admin,(req,res)=>{const name=clean(req.body.name,40);if(name.length<2||db.rooms.length>=30)return res.status(400).json({error:'Nome inválido ou limite de salas.'});const room={id:crypto.randomUUID(),name};db.rooms.push(room);save();broadcast();res.json(room)});
app.delete('/api/rooms/:id',auth,admin,(req,res)=>{const room=db.rooms.find(x=>x.id===req.params.id);if(!room)return res.sendStatus(404);for(const [sid,u] of users)if(u.room===room.id){io.to(sid).emit('removed',{reason:'Sala excluída.'});u.room=null}db.rooms=db.rooms.filter(x=>x.id!==room.id);save();broadcast();res.json({ok:true})});
app.get('/api/health',(req,res)=>res.json({ok:true}));
const socketAuth=new Map();
io.use((socket,next)=>{const user=sessions.get(socket.handshake.auth.token);if(!user)return next(new Error('Sessão inválida'));socket.data.user=user;next()});
io.on('connection',socket=>{const u={id:socket.id,name:socket.data.user.name,admin:socket.data.user.admin,room:null,muted:false,sharing:false};users.set(socket.id,u);broadcast();
const peers=()=>[...users.values()].filter(x=>x.room===u.room&&x.id!==u.id).map(x=>({id:x.id,name:x.name,admin:x.admin,sharing:x.sharing}));
function leave(){if(u.room){const old=u.room;socket.leave(old);u.room=null;u.sharing=false;socket.to(old).emit('peer-left',{id:u.id});broadcast()}}
socket.on('join-room',(id,ack)=>{if(!db.rooms.some(r=>r.id===id))return ack?.({error:'Sala não encontrada.'});leave();u.room=id;socket.join(id);const others=peers();ack?.({peers:others});socket.to(id).emit('peer-joined',{id:u.id,name:u.name,admin:u.admin});broadcast()});
socket.on('leave-room',leave);
socket.on('signal',({to,data})=>{const target=users.get(to);if(!target||!u.room||target.room!==u.room)return;if(JSON.stringify(data||{}).length>100000)return;io.to(to).emit('signal',{from:u.id,data})});
socket.on('sharing',v=>{if(!u.room)return;u.sharing=!!v;socket.to(u.room).emit('sharing',{id:u.id,sharing:u.sharing});broadcast()});
socket.on('moderate',({id,action},ack)=>{if(!u.admin)return ack?.({error:'Sem permissão.'});const target=users.get(id);if(!target)return ack?.({error:'Usuário não encontrado.'});if(target.admin)return ack?.({error:'Não é possível moderar o dono.'});if(action==='kick'||action==='ban'){if(action==='ban'){db.bans.push(target.name.toLowerCase());save();for(const [token,s] of sessions)if(s.name.toLowerCase()===target.name.toLowerCase())sessions.delete(token)}io.to(id).emit('removed',{reason:action==='ban'?'Você foi banido.':'Você foi removido da call.'});const s=io.sockets.sockets.get(id);if(s){s.disconnect(true)}ack?.({ok:true})}else if(action==='mute'){io.to(id).emit('force-mute');ack?.({ok:true})}else if(action==='stop-share'){io.to(id).emit('force-stop-share');ack?.({ok:true})}else ack?.({error:'Ação inválida.'})});
socket.on('disconnect',()=>{leave();users.delete(socket.id);broadcast()});
});
app.use(express.static('public'));app.get('*',(req,res)=>res.sendFile(path.join(process.cwd(),'public','index.html')));
server.listen(PORT,'0.0.0.0',()=>console.log(`MENDES online na porta ${PORT}`));
