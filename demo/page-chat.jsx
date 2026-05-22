// Chat
const { useState: uSCh } = React;

function Chat() {
  const conversations = [
    { id:1, name:'Mira (coach)', sub:'Coach · Mentor 3B', last:'Mooi gedaan vanmorgen 👏', time:'1u', unread:0, type:'coach', online:true },
    { id:2, name:'Lina M.', sub:'Klasgenoot', last:'Heb jij § 4.2 al?', time:'2m', unread:2, type:'peer' },
    { id:3, name:'Project Buurt', sub:'Groep · 4 leden · Coach kan meekijken', last:'Yara: Ik heb foto\'s gemaakt!', time:'12m', unread:1, type:'group', supervised:true },
    { id:4, name:'Discussie 1 — Tekst structureren', sub:'Forum · Klas 3B', last:'Mira: Goed punt, Sami!', time:'gisteren', unread:0, type:'forum' },
    { id:5, name:'Yara K.', sub:'Klasgenoot', last:'Tot zo!', time:'gisteren', unread:0, type:'peer' },
  ];
  const [openId, setOpenId] = uSCh(1);
  const open = conversations.find(c=>c.id===openId);

  return (
    <div style={{display:'grid', gridTemplateColumns:'320px 1fr', gap:0, height:'calc(100vh - 130px)', border:'1px solid var(--line)', borderRadius:14, background:'var(--surface)', overflow:'hidden'}}>
      <div style={{borderRight:'1px solid var(--line)', display:'flex', flexDirection:'column'}}>
        <div style={{padding:'14px 16px', borderBottom:'1px solid var(--line)'}}>
          <div className="row between" style={{marginBottom:10}}><h3 style={{fontSize:17}}>Chat</h3><button className="icon-btn" style={{width:30, height:30}}><Icon name="plus" size={14}/></button></div>
          <div className="row" style={{gap:8, padding:'8px 12px', background:'var(--bg)', borderRadius:10}}>
            <Icon name="search" size={14}/>
            <input style={{border:0, background:'transparent', outline:'none', flex:1, fontSize:13}} placeholder="Zoek in berichten…"/>
          </div>
        </div>
        <div style={{flex:1, overflowY:'auto'}}>
          {conversations.map(c => (
            <button key={c.id} onClick={()=>setOpenId(c.id)} style={{
              display:'flex', gap:12, padding:'12px 16px', border:0,
              background: c.id===openId?'var(--primary-50)':'transparent',
              borderLeft:'3px solid '+(c.id===openId?'var(--primary)':'transparent'),
              width:'100%', textAlign:'left', cursor:'pointer'
            }}>
              <div style={{position:'relative'}}>
                <div className="avatar" style={{width:40, height:40, fontSize:14, background: c.type==='coach'?'linear-gradient(135deg,#F8D7C8,#ECA084)':c.type==='group'||c.type==='forum'?'linear-gradient(135deg,#E0D6C5,#B8AB94)':'linear-gradient(135deg,#C7DDE2,#94BCC4)'}}>
                  {c.type==='group'||c.type==='forum'?<Icon name={c.type==='forum'?'forum':'team'} size={16}/>:c.name.split(' ').map(s=>s[0]).slice(0,2).join('')}
                </div>
                {c.online && <div style={{position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:5, background:'var(--success)', border:'2px solid var(--surface)'}}/>}
              </div>
              <div style={{flex:1, minWidth:0}}>
                <div className="row between"><div style={{fontWeight:500, fontSize:14}}>{c.name}</div><div style={{fontSize:11, color:'var(--muted)'}}>{c.time}</div></div>
                <div style={{fontSize:12, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:2}}>{c.last}</div>
                <div className="row" style={{marginTop:4, gap:6}}>
                  {c.supervised && <span className="chip" style={{fontSize:10, padding:'2px 6px'}}><Icon name="eye" size={10}/> Coach kijkt mee</span>}
                  {c.unread>0 && <span className="chip accent" style={{fontSize:10, padding:'2px 7px', marginLeft:'auto'}}>{c.unread}</span>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
      <ChatThread c={open}/>
    </div>
  );
}

function ChatThread({ c }) {
  const [msgs, setMsgs] = uSCh([
    { who:'them', text:'Hoi Sami! Hoe ging je opdracht vanmorgen?', time:'09:12' },
    { who:'me', text:'Best goed! De inleiding was lastig maar het lukte.', time:'09:14' },
    { who:'them', text:'Mooi. Wil je dat ik er straks even naar kijk?', time:'09:14' },
    { who:'me', text:'Ja graag. Ik plak hem hier.', time:'09:15' },
    { who:'them', text:'Mooi gedaan vanmorgen 👏 Echt verbetering t.o.v. vorige keer.', time:'10:02', task:true },
  ]);
  const [val, setVal] = uSCh('');
  const send = () => { if (!val.trim()) return; setMsgs([...msgs, { who:'me', text:val, time:'nu' }]); setVal(''); };

  if (!c) return <div style={{padding:32, color:'var(--muted)'}}>Selecteer een gesprek</div>;
  return (
    <div style={{display:'flex', flexDirection:'column', minHeight:0}}>
      <div style={{padding:'14px 20px', borderBottom:'1px solid var(--line)', display:'flex', alignItems:'center', gap:12}}>
        <div className="avatar" style={{width:36, height:36, fontSize:13, background:'linear-gradient(135deg,#F8D7C8,#ECA084)'}}>{c.name.split(' ').map(s=>s[0]).slice(0,2).join('')}</div>
        <div className="grow">
          <div style={{fontWeight:600, fontSize:15}}>{c.name}</div>
          <div style={{fontSize:12, color:'var(--muted)'}}>{c.sub}{c.online && ' · online'}</div>
        </div>
        <button className="icon-btn"><Icon name="phone" size={15}/></button>
        <button className="icon-btn"><Icon name="video" size={15}/></button>
      </div>
      {c.supervised && (
        <div style={{padding:'10px 20px', background:'var(--warning-100)', color:'var(--warning)', fontSize:12.5, display:'flex', alignItems:'center', gap:8}}>
          <Icon name="eye" size={14}/> Dit is een groepschat van een opdracht. Je coach kan meelezen.
        </div>
      )}
      <div style={{flex:1, overflowY:'auto', padding:'20px 24px', background:'var(--bg)'}}>
        <div className="col" style={{gap:10}}>
          {msgs.map((m, i) => (
            <div key={i} style={{alignSelf: m.who==='me'?'flex-end':'flex-start', maxWidth:'70%'}}>
              <div style={{
                padding:'10px 14px', borderRadius:14,
                background: m.who==='me'?'var(--primary)':'var(--surface)',
                color: m.who==='me'?'#fff':'var(--ink)',
                border: m.who==='me'?'none':'1px solid var(--line)',
                fontSize:14, lineHeight:1.4
              }}>
                {m.text}
              </div>
              {m.task && (
                <div style={{marginTop:6, padding:'10px 12px', background:'var(--surface)', border:'1px solid var(--line)', borderLeft:'3px solid var(--accent)', borderRadius:10, fontSize:13, display:'flex', alignItems:'center', gap:10}}>
                  <Icon name="tasks" size={15}/>
                  <div className="grow"><div style={{fontWeight:500}}>Taak: Volgende inleiding deze week schrijven</div><div style={{fontSize:11, color:'var(--muted)'}}>Aangemaakt door Mira · deadline vrijdag</div></div>
                  <button className="btn subtle sm">Bekijk</button>
                </div>
              )}
              <div style={{fontSize:11, color:'var(--muted)', marginTop:4, textAlign: m.who==='me'?'right':'left'}}>{m.time}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{padding:'12px 16px', borderTop:'1px solid var(--line)', display:'flex', gap:8, alignItems:'flex-end'}}>
        <button className="icon-btn"><Icon name="paperclip" size={15}/></button>
        <textarea className="textarea" placeholder="Schrijf een bericht…" value={val} onChange={e=>setVal(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send();}}} style={{minHeight:42, padding:'10px 12px', flex:1}}/>
        <button className="btn primary" onClick={send}><Icon name="send" size={14}/></button>
      </div>
    </div>
  );
}

window.Chat = Chat;
