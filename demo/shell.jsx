// Shell — sidebar, topbar, a11y menu
const { useState, useEffect, useMemo, useRef, createContext, useContext } = React;

const AppCtx = createContext(null);
window.useApp = () => useContext(AppCtx);

function A11yPanel({ open, onClose }) {
  const [contrast, setContrast] = useState(() => document.documentElement.dataset.contrast || 'normal');
  const [font, setFont] = useState(() => document.documentElement.dataset.font || 'default');
  const [density, setDensity] = useState(() => document.documentElement.dataset.density || 'cozy');
  const [reduceMotion, setReduceMotion] = useState(false);
  const [readAloud, setReadAloud] = useState(false);
  const [translate, setTranslate] = useState('nl');

  useEffect(() => { document.documentElement.dataset.contrast = contrast; }, [contrast]);
  useEffect(() => { document.documentElement.dataset.font = font; }, [font]);
  useEffect(() => { document.documentElement.dataset.density = density; }, [density]);

  if (!open) return null;
  return (
    <div className="a11y-panel" role="dialog" aria-label="Toegankelijkheid">
      <h4>
        Toegankelijkheid
        <button className="icon-btn" style={{width:28,height:28,border:'none',background:'transparent'}} onClick={onClose} aria-label="Sluit">
          <Icon name="x" size={16}/>
        </button>
      </h4>
      <div className="a11y-row">
        <div><div className="lab">Contrast</div><div className="sub">Hoger contrast voor leesbaarheid</div></div>
        <div className="seg">
          <button className={contrast==='normal'?'on':''} onClick={()=>setContrast('normal')}>Normaal</button>
          <button className={contrast==='high'?'on':''} onClick={()=>setContrast('high')}>Hoog</button>
        </div>
      </div>
      <div className="a11y-row">
        <div><div className="lab">Lettergrootte</div><div className="sub">Maakt alle tekst groter</div></div>
        <div className="seg">
          <button className={density==='compact'?'on':''} onClick={()=>setDensity('compact')}>S</button>
          <button className={density==='cozy'?'on':''} onClick={()=>setDensity('cozy')}>M</button>
          <button className={density==='comfortable'?'on':''} onClick={()=>setDensity('comfortable')}>L</button>
        </div>
      </div>
      <div className="a11y-row">
        <div><div className="lab">Lettertype</div><div className="sub">Dyslexie-vriendelijk</div></div>
        <div className="seg">
          <button className={font==='default'?'on':''} onClick={()=>setFont('default')}>Standaard</button>
          <button className={font==='dyslexic'?'on':''} onClick={()=>setFont('dyslexic')}>Dyslexie</button>
        </div>
      </div>
      <div className="a11y-row">
        <div><div className="lab">Beweging beperken</div><div className="sub">Minder animaties</div></div>
        <label className="toggle"><input type="checkbox" checked={reduceMotion} onChange={e=>setReduceMotion(e.target.checked)}/><span className="slider"/></label>
      </div>
      <div className="a11y-row">
        <div><div className="lab">Voorlezen</div><div className="sub">Tekst hardop laten lezen</div></div>
        <label className="toggle"><input type="checkbox" checked={readAloud} onChange={e=>setReadAloud(e.target.checked)}/><span className="slider"/></label>
      </div>
      <div className="a11y-row">
        <div><div className="lab">Taal / vertaling</div><div className="sub">AI-vertaling voor leerling & ouders</div></div>
        <select className="select" style={{width:'auto', padding:'6px 28px 6px 10px', fontSize:13}} value={translate} onChange={e=>setTranslate(e.target.value)}>
          <option value="nl">Nederlands</option>
          <option value="en">English</option>
          <option value="ar">العربية</option>
          <option value="tr">Türkçe</option>
          <option value="uk">Українська</option>
          <option value="pl">Polski</option>
        </select>
      </div>
    </div>
  );
}

const LEERLING_NAV = [
  { id: 'welkom', label: 'Welkom', icon: 'home' },
  { id: 'taken', label: 'Mijn taken', icon: 'tasks', badge: '4' },
  { id: 'cursussen', label: 'Cursussen', icon: 'course' },
  { id: 'coachplan', label: 'Mijn plan', icon: 'plan' },
  { id: 'chat', label: 'Chat', icon: 'chat', badge: '2' },
];
const COACH_NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'home' },
  { id: 'coachplan-vul', label: 'Coachplannen', icon: 'plan', badge: '3' },
  { id: 'cursusbouwer', label: 'Cursusbouwer', icon: 'edit' },
  { id: 'chat', label: 'Chat', icon: 'chat', badge: '5' },
];

function Sidebar() {
  const { role, setRole, page, setPage } = useApp();
  const nav = role === 'leerling' ? LEERLING_NAV : COACH_NAV;
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">i</div>
        <div className="brand-name">Incluvo</div>
      </div>
      <div className="role-switch" role="tablist" aria-label="Wissel rol">
        <button className={role==='leerling'?'on':''} onClick={()=>setRole('leerling')}>Leerling</button>
        <button className={role==='coach'?'on':''} onClick={()=>setRole('coach')}>Coach</button>
      </div>
      <nav className="nav-section">
        <div className="nav-label">Navigatie</div>
        {nav.map(n => (
          <button key={n.id} className={'nav-item' + (page===n.id?' active':'')} onClick={()=>setPage(n.id)}>
            <Icon name={n.icon}/>
            <span>{n.label}</span>
            {n.badge && <span className="nav-badge">{n.badge}</span>}
          </button>
        ))}
      </nav>
      {role === 'leerling' && (
        <div className="nav-section">
          <div className="nav-label">Snel</div>
          <button className="nav-item" onClick={()=>{}}><Icon name="star"/><span>Mijn successen</span></button>
          <button className="nav-item" onClick={()=>{}}><Icon name="profile"/><span>Mijn profiel</span></button>
        </div>
      )}
      <div className="user-card">
        {role === 'leerling' ? <>
          <div className="avatar">SJ</div>
          <div className="meta"><div className="name">Sami Jansen</div><div className="sub">Klas 3B · VMBO-T</div></div>
        </> : <>
          <div className="avatar coach">MV</div>
          <div className="meta"><div className="name">Mira van Dijk</div><div className="sub">Coach · Mentor 3B</div></div>
        </>}
      </div>
    </aside>
  );
}

function Topbar({ crumbs }) {
  const { setMenuOpen, a11yOpen, setA11yOpen } = useApp();
  return (
    <header className="topbar">
      <button className="icon-btn menu-btn" onClick={()=>setMenuOpen(o=>!o)} aria-label="Menu"><Icon name="menu"/></button>
      <div className="crumbs">
        {crumbs.map((c, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span className="sep">/</span>}
            {i === crumbs.length-1 ? <strong>{c}</strong> : <span>{c}</span>}
          </React.Fragment>
        ))}
      </div>
      <div className="topbar-spacer"/>
      <div className="topbar-actions">
        <button className="icon-btn desktop-only" aria-label="Zoeken"><Icon name="search"/></button>
        <button className="icon-btn" aria-label="Notificaties"><Icon name="bell"/><span className="dot"/></button>
        <button className={'icon-btn' + (a11yOpen?' on':'')} onClick={()=>setA11yOpen(o=>!o)} aria-label="Toegankelijkheid">
          <Icon name="a11y"/>
        </button>
      </div>
      <A11yPanel open={a11yOpen} onClose={()=>setA11yOpen(false)}/>
    </header>
  );
}

function Shell({ crumbs, children }) {
  const { menuOpen, setMenuOpen } = useApp();
  return (
    <div className={'app' + (menuOpen ? ' menu-open':'')}>
      <Sidebar/>
      <div className="scrim" onClick={()=>setMenuOpen(false)}/>
      <div className="main">
        <Topbar crumbs={crumbs}/>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

window.Shell = Shell;
window.AppCtx = AppCtx;
