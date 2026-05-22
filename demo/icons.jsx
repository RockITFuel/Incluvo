// Icon set — minimal stroke icons (no emoji)
const Icon = ({ name, size = 18, stroke = 1.7 }) => {
  const props = {
    width: size, height: size, viewBox: "0 0 24 24",
    fill: "none", stroke: "currentColor",
    strokeWidth: stroke, strokeLinecap: "round", strokeLinejoin: "round",
  };
  switch (name) {
    case 'home': return <svg {...props}><path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/></svg>;
    case 'tasks': return <svg {...props}><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M8 9l2 2 4-4"/><path d="M8 16h8"/></svg>;
    case 'course': return <svg {...props}><path d="M4 6a2 2 0 0 1 2-2h12v16H6a2 2 0 0 1-2-2z"/><path d="M8 8h8M8 12h6"/></svg>;
    case 'chat': return <svg {...props}><path d="M21 12a8 8 0 1 1-3-6.2L21 4l-1 4.2A8 8 0 0 1 21 12z"/></svg>;
    case 'plan': return <svg {...props}><path d="M9 4h6l1 3h3v13H5V7h3z"/><path d="M9 12h6M9 16h4"/></svg>;
    case 'profile': return <svg {...props}><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>;
    case 'team': return <svg {...props}><circle cx="9" cy="9" r="3.5"/><circle cx="17" cy="10" r="2.5"/><path d="M3 19c0-3 2.7-5 6-5s6 2 6 5"/><path d="M15 18c0-2 1.5-3.5 4-3.5s2 0 2 0"/></svg>;
    case 'star': return <svg {...props}><path d="M12 3l2.6 5.6 6 .6-4.5 4.2 1.3 6-5.4-3-5.4 3 1.3-6L3.4 9.2l6-.6z"/></svg>;
    case 'bell': return <svg {...props}><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2H4.5z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>;
    case 'a11y': return <svg {...props}><circle cx="12" cy="5" r="2"/><path d="M5 9h14M9 9l1 11M15 9l-1 11M9 14h6"/></svg>;
    case 'menu': return <svg {...props}><path d="M4 7h16M4 12h16M4 17h16"/></svg>;
    case 'plus': return <svg {...props}><path d="M12 5v14M5 12h14"/></svg>;
    case 'search': return <svg {...props}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg>;
    case 'check': return <svg {...props}><path d="M5 12l5 5 9-11"/></svg>;
    case 'x': return <svg {...props}><path d="M6 6l12 12M18 6L6 18"/></svg>;
    case 'arrow-left': return <svg {...props}><path d="M19 12H5M12 5l-7 7 7 7"/></svg>;
    case 'arrow-right': return <svg {...props}><path d="M5 12h14M12 5l7 7-7 7"/></svg>;
    case 'chevron-down': return <svg {...props}><path d="M6 9l6 6 6-6"/></svg>;
    case 'chevron-right': return <svg {...props}><path d="M9 6l6 6-6 6"/></svg>;
    case 'pdf': return <svg {...props}><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/><path d="M9 14h2M9 17h6M9 11h1"/></svg>;
    case 'mic': return <svg {...props}><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>;
    case 'video': return <svg {...props}><rect x="3" y="6" width="13" height="12" rx="2"/><path d="M16 10l5-3v10l-5-3z"/></svg>;
    case 'file': return <svg {...props}><path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4"/></svg>;
    case 'youtube': return <svg {...props}><rect x="2" y="6" width="20" height="12" rx="3"/><path d="M10 9l5 3-5 3z" fill="currentColor"/></svg>;
    case 'forum': return <svg {...props}><path d="M4 5h13v9H8l-4 3z"/><path d="M8 9h5"/></svg>;
    case 'page': return <svg {...props}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>;
    case 'eye': return <svg {...props}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>;
    case 'eye-off': return <svg {...props}><path d="M3 3l18 18"/><path d="M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.3 4M6.6 6.6A17 17 0 0 0 2 12s4 6 10 6c1.7 0 3.2-.4 4.5-1"/></svg>;
    case 'send': return <svg {...props}><path d="M3 11l18-7-7 18-3-8z"/></svg>;
    case 'paperclip': return <svg {...props}><path d="M21 12l-9 9a5 5 0 0 1-7-7l9-9a3 3 0 0 1 4 4l-9 9a1 1 0 0 1-1-1l8-8"/></svg>;
    case 'sparkle': return <svg {...props}><path d="M12 3l1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5z"/><path d="M19 4l.5 1.5L21 6l-1.5.5L19 8l-.5-1.5L17 6l1.5-.5z"/></svg>;
    case 'building': return <svg {...props}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h6"/></svg>;
    case 'globe': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>;
    case 'flag': return <svg {...props}><path d="M5 21V4h12l-2 4 2 4H5"/></svg>;
    case 'flask': return <svg {...props}><path d="M9 3h6M10 3v6L4 19a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-6-10V3"/></svg>;
    case 'edit': return <svg {...props}><path d="M4 20h4l11-11-4-4L4 16z"/><path d="M14 5l4 4"/></svg>;
    case 'trash': return <svg {...props}><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>;
    case 'drag': return <svg {...props}><circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/></svg>;
    case 'calendar': return <svg {...props}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>;
    case 'clock': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>;
    case 'flame': return <svg {...props}><path d="M12 3c2 5 6 6 6 11a6 6 0 1 1-12 0c0-3 2-4 2-7 1.5 1 2 2 4-4z"/></svg>;
    case 'heart': return <svg {...props}><path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.5-7 10-7 10z"/></svg>;
    case 'ear': return <svg {...props}><path d="M7 8a5 5 0 0 1 10 0c0 4-3 4-3 7a3 3 0 0 1-6 0"/></svg>;
    case 'compass': return <svg {...props}><circle cx="12" cy="12" r="9"/><path d="M16 8l-2 6-6 2 2-6z"/></svg>;
    case 'lightbulb': return <svg {...props}><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 2 2 2 4h4c0-2 1-3 2-4a6 6 0 0 0-4-10z"/></svg>;
    case 'archive': return <svg {...props}><rect x="3" y="4" width="18" height="4"/><path d="M5 8v12h14V8M10 12h4"/></svg>;
    case 'phone': return <svg {...props}><path d="M5 4h4l2 5-2 1a11 11 0 0 0 5 5l1-2 5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/></svg>;
    case 'shield': return <svg {...props}><path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/></svg>;
    default: return <svg {...props}><circle cx="12" cy="12" r="8"/></svg>;
  }
};
window.Icon = Icon;
