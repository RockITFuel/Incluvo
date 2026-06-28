// Leerling pages
const { useState: uS } = React;

function Welkom() {
  const [mood, setMood] = uS(2);
  // Successen kan confronterend zijn als een leerling weinig succes ervaart —
  // daarom uitschakelbaar (feedback Mark Timmermans 12-06-2026).
  const [showSuccess, setShowSuccess] = uS(true);
  const moods = [
    { e: '😞', label: 'Niet zo' },
    { e: '😕', label: 'Matig' },
    { e: '😐', label: 'Oké' },
    { e: '🙂', label: 'Goed' },
    { e: '😄', label: 'Top' },
  ];
  const { setPage } = useApp();
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Hoi Sami 👋</h1>
          <div className="sub">Donderdag 7 mei · Week 19 · Nog 3 weken tot de meivakantie</div>
        </div>
        <div className="row">
          <span className="chip success"><Icon name="flame" size={14}/> 4 dagen op rij</span>
          <span className="chip primary"><Icon name="star" size={14}/> 12 successen</span>
        </div>
      </div>

      <div className="grid" style={{gridTemplateColumns:'2fr 1fr', gap:24}}>
        <div className="col" style={{gap:24}}>
          <div className="card">
            <div className="card-head">
              <div>
                <h3>Hoe zit je erbij vandaag?</h3>
                <div className="card-sub">Je coach Mira ziet dit alleen als je het deelt.</div>
              </div>
              <button className="btn ghost sm">Niet vandaag</button>
            </div>
            <div className="moods" role="radiogroup" aria-label="Mood">
              {moods.map((m, i) => (
                <button key={i} className={'mood' + (mood===i?' on':'')} onClick={()=>setMood(i)} aria-label={m.label} title={m.label}>{m.e}</button>
              ))}
            </div>
            {mood >= 0 && (
              <div style={{marginTop:16, padding:'12px 14px', background:'var(--primary-50)', borderRadius:12, fontSize:13, color:'var(--primary-700)'}}>
                Fijn dat je dit deelt. Je hebt 4 taken voor vandaag — zullen we beginnen met de eerste?
              </div>
            )}
          </div>

          {/* Versimpeld: alleen het aantal taken + doorklik, niet de hele lijst
              (feedback Mark Timmermans 12-06-2026). De volledige takenlijst staat
              op de pagina 'Mijn taken'. */}
          <div className="card">
            <div className="card-head">
              <div><h3>Vandaag</h3><div className="card-sub">Een rustig overzicht — je taken staan op één plek</div></div>
            </div>
            <div className="row" style={{gap:16, alignItems:'center'}}>
              <div style={{fontSize:40, fontWeight:600, color:'var(--primary-700)', lineHeight:1}}>4</div>
              <div className="grow">
                <div style={{fontWeight:500, fontSize:15}}>taken voor vandaag</div>
                <div style={{fontSize:13, color:'var(--muted)'}}>1 met een deadline</div>
              </div>
              <button className="btn subtle" onClick={()=>setPage('taken')}>Naar alle taken <Icon name="arrow-right" size={14}/></button>
            </div>
          </div>
        </div>

        <div className="col" style={{gap:24}}>
          <div className="card" style={{background:'var(--primary)', borderColor:'var(--primary)', color:'#fff'}}>
            <div style={{fontSize:13, opacity:0.85, fontWeight:500, marginBottom:6}}>Volgende afspraak</div>
            <h3 style={{color:'#fff', fontSize:20}}>Coachgesprek met Mira</h3>
            <div style={{fontSize:14, opacity:0.85, marginTop:6}}>Vrijdag 8 mei · 10:30 — 11:00 · Lokaal 1.14</div>
            <div className="row" style={{marginTop:16, gap:8}}>
              <button className="btn" style={{background:'rgba(255,255,255,0.18)', color:'#fff'}}><Icon name="chat" size={14}/> Bericht</button>
              <button className="btn" style={{background:'#fff', color:'var(--primary-700)'}}>Bereid voor</button>
            </div>
          </div>

          {/* Uitschakelbaar: voor een leerling die het lastig heeft kan een lijst
              successen confronterend zijn (feedback Mark Timmermans 12-06-2026). */}
          <div className="card">
            <div className="card-head">
              <h3>Successen</h3>
              <div className="row" style={{gap:8}}>
                {showSuccess && <span className="chip success">+3 deze week</span>}
                <button
                  className="btn ghost sm"
                  aria-pressed={!showSuccess}
                  onClick={()=>setShowSuccess(!showSuccess)}
                >{showSuccess ? 'Verbergen' : 'Tonen'}</button>
              </div>
            </div>
            {showSuccess ? (
              <div className="col" style={{gap:10}}>
                <Success icon="check" title="Cursus 'Tekst structureren' afgerond" when="Maandag"/>
                <Success icon="star" title="Eerste opdracht ingeleverd" when="Dinsdag" tone="accent"/>
                <Success icon="flame" title="4 dagen op rij ingelogd" when="Vandaag" tone="warning"/>
              </div>
            ) : (
              <div style={{fontSize:13, color:'var(--muted)'}}>Successen staan even uit.</div>
            )}
          </div>

          <div className="card">
            <div className="card-head"><h3>Sociaal</h3><span className="chip">Klas 3B</span></div>
            <div className="col" style={{gap:8}}>
              <ChatRow name="Lina M." msg="Heb jij § 4.2 al?" time="2m" unread={2}/>
              <ChatRow name="Groep · Project Buurt" msg="Yara: Ik heb foto's gemaakt!" time="12m" unread={1}/>
              <ChatRow name="Mira (coach)" msg="Mooi gedaan vanmorgen 👏" time="1u"/>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function TaskRow({ done, title, sub, tag, urgent }) {
  const [d, setD] = uS(done);
  return (
    <div className="row" style={{padding:'10px 12px', border:'1px solid var(--line)', borderRadius:10, background: d?'var(--bg-2)':'var(--surface)'}}>
      <button onClick={()=>setD(!d)} aria-label="Afvinken" style={{
        width:22, height:22, borderRadius:6, border:'1.5px solid var(--line)',
        background: d?'var(--success)':'transparent', color:'#fff',
        display:'grid', placeItems:'center', flexShrink:0
      }}>{d && <Icon name="check" size={14} stroke={2.5}/>}</button>
      <div className="grow" style={{minWidth:0, textDecoration: d?'line-through':'none', color: d?'var(--muted)':'var(--ink)'}}>
        <div style={{fontWeight:500, fontSize:14}}>{title}</div>
        <div style={{fontSize:12, color:'var(--muted)'}}>{sub}</div>
      </div>
      {urgent && <span className="chip danger">Vandaag</span>}
      <span className="chip">{tag}</span>
    </div>
  );
}

function RecCard({ tag, title, meta, tone }) {
  return (
    <div style={{border:'1px solid var(--line)', borderRadius:12, overflow:'hidden', cursor:'pointer'}}>
      <div style={{height:80, background: tone==='primary'?'var(--primary-100)':tone==='accent'?'var(--accent-100)':'var(--warning-100)', display:'grid', placeItems:'center'}}>
        <Icon name={tag==='Video'?'video':tag==='Podcast'?'mic':'compass'} size={28}/>
      </div>
      <div style={{padding:12}}>
        <div className="chip" style={{marginBottom:6, fontSize:11}}>{tag}</div>
        <div style={{fontWeight:500, fontSize:14, lineHeight:1.3, textWrap:'pretty'}}>{title}</div>
        <div style={{fontSize:12, color:'var(--muted)', marginTop:4}}>{meta}</div>
      </div>
    </div>
  );
}

function Success({ icon, title, when, tone }) {
  const bg = tone==='accent'?'var(--accent-100)':tone==='warning'?'var(--warning-100)':'var(--success-100)';
  const fg = tone==='accent'?'var(--accent-700)':tone==='warning'?'var(--warning)':'var(--success)';
  return (
    <div className="row">
      <div style={{width:32, height:32, borderRadius:10, background:bg, color:fg, display:'grid', placeItems:'center', flexShrink:0}}>
        <Icon name={icon} size={16}/>
      </div>
      <div className="grow" style={{minWidth:0}}>
        <div style={{fontWeight:500, fontSize:13.5}}>{title}</div>
        <div style={{fontSize:12, color:'var(--muted)'}}>{when}</div>
      </div>
    </div>
  );
}

function QuickLink({ icon, label, onClick }) {
  return (
    <button onClick={onClick} style={{
      display:'flex', flexDirection:'column', gap:8, alignItems:'flex-start',
      padding:'14px 12px', border:'1px solid var(--line)', borderRadius:12,
      background:'var(--bg-2)', textAlign:'left', color:'var(--ink-2)', cursor:'pointer'
    }}>
      <Icon name={icon} size={18}/>
      <div style={{fontWeight:500, fontSize:13}}>{label}</div>
    </button>
  );
}

function ChatRow({ name, msg, time, unread }) {
  return (
    <div className="row" style={{cursor:'pointer'}}>
      <div className="avatar" style={{width:32, height:32, fontSize:12}}>{name.split(' ').map(s=>s[0]).slice(0,2).join('')}</div>
      <div className="grow" style={{minWidth:0}}>
        <div className="row between"><div style={{fontWeight:500, fontSize:13}}>{name}</div><div style={{fontSize:11, color:'var(--muted)'}}>{time}</div></div>
        <div style={{fontSize:12, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{msg}</div>
      </div>
      {unread && <span className="chip accent" style={{minWidth:20, justifyContent:'center'}}>{unread}</span>}
    </div>
  );
}

window.Welkom = Welkom;
