/* @ds-bundle: {"format":3,"namespace":"CobaltReaderDesignSystem_feb28f","components":[{"name":"Badge","sourcePath":"components/display/Badge.jsx"},{"name":"Card","sourcePath":"components/display/Card.jsx"},{"name":"Button","sourcePath":"components/forms/Button.jsx"},{"name":"IconButton","sourcePath":"components/forms/IconButton.jsx"},{"name":"Input","sourcePath":"components/forms/Input.jsx"},{"name":"Select","sourcePath":"components/forms/Select.jsx"},{"name":"SearchResult","sourcePath":"components/navigation/SearchResult.jsx"},{"name":"TreeItem","sourcePath":"components/navigation/TreeItem.jsx"}],"sourceHashes":{"components/display/Badge.jsx":"b169e3366758","components/display/Card.jsx":"e8eef55849ac","components/forms/Button.jsx":"6048e7443798","components/forms/IconButton.jsx":"afd9346e5b8e","components/forms/Input.jsx":"b2acefb582b7","components/forms/Select.jsx":"36f69ee1b3fb","components/navigation/SearchResult.jsx":"ab1adfdddad7","components/navigation/TreeItem.jsx":"d9eb72948700","ui_kits/curator/App.jsx":"99d0465c7fb6","ui_kits/curator/Reader.jsx":"08d239eef325","ui_kits/curator/Sidebar.jsx":"ae8ede273da3","ui_kits/curator/data.js":"b175e297f38c"},"inlinedExternals":[],"unexposedExports":[]} */

(() => {

const __ds_ns = (window.CobaltReaderDesignSystem_feb28f = window.CobaltReaderDesignSystem_feb28f || {});

const __ds_scope = {};

(__ds_ns.__errors = __ds_ns.__errors || []);

// components/display/Badge.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE_ID = 'cr-badge-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  .cr-badge { display: inline-flex; align-items: center; gap: 5px;
    font-family: var(--font-ui); font-size: var(--text-xs); font-weight: var(--weight-medium);
    line-height: 1; padding: 4px 8px; border-radius: var(--radius-full);
    border: 1px solid transparent; white-space: nowrap; }
  .cr-badge--pill { border-radius: var(--radius-full); }
  .cr-badge--square { border-radius: var(--radius-sm); }
  .cr-badge__dot { width: 6px; height: 6px; border-radius: 50%; background: currentColor; }

  .cr-badge--neutral { background: var(--surface-alt); color: var(--muted); border-color: var(--border); }
  .cr-badge--accent  { background: var(--accent-soft); color: var(--accent-hover); border-color: color-mix(in srgb, var(--accent) 30%, transparent); }
  .cr-badge--cyan    { background: var(--highlight-soft); color: var(--cyan-light); border-color: color-mix(in srgb, var(--cyan) 30%, transparent); }
  .cr-badge--success { background: var(--success-soft); color: var(--success); border-color: color-mix(in srgb, var(--success) 30%, transparent); }
  .cr-badge--warning { background: var(--warning-soft); color: var(--warning); border-color: color-mix(in srgb, var(--warning) 30%, transparent); }
  .cr-badge--error   { background: var(--error-soft); color: var(--error); border-color: color-mix(in srgb, var(--error) 35%, transparent); }
  `;
  document.head.appendChild(el);
}
function Badge(props) {
  const {
    tone = 'neutral',
    shape = 'pill',
    dot = false,
    icon,
    className = '',
    children,
    ...rest
  } = props;
  const cls = ['cr-badge', `cr-badge--${tone}`, `cr-badge--${shape}`, className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("span", _extends({
    className: cls
  }, rest), dot && /*#__PURE__*/React.createElement("span", {
    className: "cr-badge__dot"
  }), icon && /*#__PURE__*/React.createElement("i", {
    className: icon,
    "aria-hidden": "true"
  }), children);
}
Object.assign(__ds_scope, { Badge });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Badge.jsx", error: String((e && e.message) || e) }); }

// components/display/Card.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE_ID = 'cr-card-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  .cr-card { display: block; background: var(--surface); border: 1px solid var(--border);
    border-radius: var(--radius-lg); padding: var(--space-5); color: var(--fg); }
  .cr-card--raised { box-shadow: var(--shadow); }
  .cr-card--interactive { cursor: pointer; text-align: left; width: 100%;
    transition: border-color var(--transition), box-shadow var(--transition), transform var(--transition), background var(--transition); }
  .cr-card--interactive:hover { border-color: var(--accent); box-shadow: var(--glow-accent); }
  .cr-card--interactive:active { transform: translateY(1px); }
  .cr-card__media { display: inline-flex; align-items: center; justify-content: center;
    width: 38px; height: 38px; border-radius: var(--radius); background: var(--accent-soft);
    color: var(--accent); font-size: 16px; margin-bottom: var(--space-3); }
  .cr-card__title { font-size: var(--text-md); font-weight: var(--weight-semibold); margin: 0 0 var(--space-1); }
  .cr-card__body { color: var(--muted); font-size: var(--text-base); line-height: var(--leading-ui); margin: 0; }
  `;
  document.head.appendChild(el);
}
function Card(props) {
  const {
    raised = false,
    interactive = false,
    icon,
    title,
    children,
    className = '',
    ...rest
  } = props;
  const cls = ['cr-card', raised ? 'cr-card--raised' : '', interactive ? 'cr-card--interactive' : '', className].filter(Boolean).join(' ');
  const Tag = interactive ? 'button' : 'div';
  return /*#__PURE__*/React.createElement(Tag, _extends({
    className: cls
  }, rest), icon && /*#__PURE__*/React.createElement("span", {
    className: "cr-card__media"
  }, /*#__PURE__*/React.createElement("i", {
    className: icon,
    "aria-hidden": "true"
  })), title && /*#__PURE__*/React.createElement("p", {
    className: "cr-card__title"
  }, title), children && /*#__PURE__*/React.createElement("div", {
    className: "cr-card__body"
  }, children));
}
Object.assign(__ds_scope, { Card });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/display/Card.jsx", error: String((e && e.message) || e) }); }

// components/forms/Button.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE_ID = 'cr-button-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  .cr-btn {
    display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
    font-family: var(--font-ui); font-weight: var(--weight-medium); line-height: 1;
    border: 1px solid transparent; border-radius: var(--radius-sm); cursor: pointer;
    white-space: nowrap; text-decoration: none; user-select: none;
    transition: background var(--transition), color var(--transition),
      border-color var(--transition), box-shadow var(--transition), transform var(--transition);
  }
  .cr-btn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-ring); }
  .cr-btn:active { transform: translateY(0.5px); }
  .cr-btn[disabled] { opacity: 0.45; cursor: not-allowed; pointer-events: none; }

  .cr-btn--sm { height: 28px; padding: 0 var(--space-3); font-size: var(--text-sm); }
  .cr-btn--md { height: 34px; padding: 0 var(--space-4); font-size: var(--text-base); }
  .cr-btn--lg { height: 42px; padding: 0 var(--space-5); font-size: var(--text-md); }
  .cr-btn--full { width: 100%; }

  .cr-btn--primary { background: var(--accent); color: #fff; }
  .cr-btn--primary:hover { background: var(--accent-hover); box-shadow: var(--glow-accent); }
  .cr-btn--primary:active { background: var(--accent-active); }

  .cr-btn--secondary { background: var(--surface-alt); color: var(--fg); border-color: var(--border-strong); }
  .cr-btn--secondary:hover { background: var(--surface-raised); border-color: var(--accent); }

  .cr-btn--ghost { background: transparent; color: var(--muted); }
  .cr-btn--ghost:hover { background: var(--surface-alt); color: var(--fg); }

  .cr-btn--danger { background: transparent; color: var(--error); border-color: color-mix(in srgb, var(--error) 45%, transparent); }
  .cr-btn--danger:hover { background: var(--error-soft); border-color: var(--error); }

  .cr-btn__icon { font-size: 0.95em; line-height: 1; }
  `;
  document.head.appendChild(el);
}
function Button(props) {
  const {
    variant = 'primary',
    size = 'md',
    icon,
    iconRight,
    fullWidth = false,
    disabled = false,
    type = 'button',
    className = '',
    children,
    ...rest
  } = props;
  const cls = ['cr-btn', `cr-btn--${variant}`, `cr-btn--${size}`, fullWidth ? 'cr-btn--full' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: type,
    className: cls,
    disabled: disabled
  }, rest), icon && /*#__PURE__*/React.createElement("i", {
    className: `cr-btn__icon ${icon}`,
    "aria-hidden": "true"
  }), children && /*#__PURE__*/React.createElement("span", null, children), iconRight && /*#__PURE__*/React.createElement("i", {
    className: `cr-btn__icon ${iconRight}`,
    "aria-hidden": "true"
  }));
}
Object.assign(__ds_scope, { Button });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Button.jsx", error: String((e && e.message) || e) }); }

// components/forms/IconButton.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE_ID = 'cr-iconbutton-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  .cr-iconbtn {
    display: inline-flex; align-items: center; justify-content: center;
    background: transparent; border: 0; color: var(--muted); cursor: pointer;
    border-radius: var(--radius); transition: background var(--transition), color var(--transition), box-shadow var(--transition);
  }
  .cr-iconbtn:hover { background: var(--surface-alt); color: var(--fg); }
  .cr-iconbtn:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--accent-ring); }
  .cr-iconbtn[disabled] { opacity: 0.4; cursor: not-allowed; pointer-events: none; }
  .cr-iconbtn.is-active { background: var(--accent-soft); color: var(--accent); }
  .cr-iconbtn--sm { width: 28px; height: 28px; font-size: 13px; }
  .cr-iconbtn--md { width: 34px; height: 34px; font-size: 15px; }
  .cr-iconbtn--lg { width: 42px; height: 42px; font-size: 18px; }
  `;
  document.head.appendChild(el);
}
function IconButton(props) {
  const {
    icon,
    size = 'md',
    active = false,
    label,
    className = '',
    ...rest
  } = props;
  const cls = ['cr-iconbtn', `cr-iconbtn--${size}`, active ? 'is-active' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    "aria-label": label,
    title: label
  }, rest), /*#__PURE__*/React.createElement("i", {
    className: icon,
    "aria-hidden": "true"
  }));
}
Object.assign(__ds_scope, { IconButton });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/IconButton.jsx", error: String((e && e.message) || e) }); }

// components/forms/Input.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE_ID = 'cr-input-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  .cr-input { display: inline-flex; align-items: center; gap: var(--space-2);
    width: 100%; height: 34px; padding: 0 var(--space-3);
    background: var(--surface-alt); border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm); color: var(--fg);
    transition: border-color var(--transition), box-shadow var(--transition), background var(--transition); }
  .cr-input:focus-within { border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
  .cr-input__icon { color: var(--muted); font-size: 13px; flex: none; }
  .cr-input__field { flex: 1; min-width: 0; background: none; border: 0; outline: none;
    color: var(--fg); font: var(--text-ui)/1 var(--font-ui); }
  .cr-input__field::placeholder { color: var(--muted); }
  .cr-input__field[type="search"]::-webkit-search-cancel-button { -webkit-appearance: none; }
  /* Flush chrome variant — no box, fills like a sidebar control */
  .cr-input--flush { background: transparent; border-color: transparent; }
  .cr-input--flush:hover { background: var(--surface-alt); }
  .cr-input--flush:focus-within { background: var(--accent-soft); border-color: transparent; box-shadow: none; }
  `;
  document.head.appendChild(el);
}
function Input(props) {
  const {
    icon,
    flush = false,
    className = '',
    type = 'text',
    ...rest
  } = props;
  const cls = ['cr-input', flush ? 'cr-input--flush' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("label", {
    className: cls
  }, icon && /*#__PURE__*/React.createElement("i", {
    className: `cr-input__icon ${icon}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("input", _extends({
    className: "cr-input__field",
    type: type
  }, rest)));
}
Object.assign(__ds_scope, { Input });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Input.jsx", error: String((e && e.message) || e) }); }

// components/forms/Select.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE_ID = 'cr-select-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  .cr-select { position: relative; display: inline-flex; align-items: center; width: 100%; }
  .cr-select__field { appearance: none; -webkit-appearance: none;
    width: 100%; height: 34px; padding: 0 var(--space-8) 0 var(--space-3);
    background: var(--surface-alt); color: var(--fg);
    border: 1px solid var(--border-strong); border-radius: var(--radius-sm);
    font: var(--text-ui)/1 var(--font-ui); cursor: pointer;
    transition: border-color var(--transition), box-shadow var(--transition), background var(--transition); }
  .cr-select__field:hover { border-color: var(--accent); }
  .cr-select__field:focus-visible { outline: none; border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-ring); }
  .cr-select__chevron { position: absolute; right: var(--space-3); color: var(--muted); pointer-events: none; font-size: 12px; }
  /* Flush chrome variant — the sidebar project switcher */
  .cr-select--flush .cr-select__field { background: transparent; border-color: transparent; font-weight: var(--weight-medium); }
  .cr-select--flush .cr-select__field:hover { background: var(--surface-alt); }
  .cr-select--flush .cr-select__field:focus-visible { background: var(--accent-soft); box-shadow: none; }
  `;
  document.head.appendChild(el);
}
function Select(props) {
  const {
    options = [],
    flush = false,
    placeholder,
    className = '',
    children,
    ...rest
  } = props;
  const cls = ['cr-select', flush ? 'cr-select--flush' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("div", {
    className: cls
  }, /*#__PURE__*/React.createElement("select", _extends({
    className: "cr-select__field"
  }, rest), placeholder && /*#__PURE__*/React.createElement("option", {
    value: "",
    disabled: true
  }, placeholder), options.map(o => {
    const value = typeof o === 'string' ? o : o.value;
    const label = typeof o === 'string' ? o : o.label;
    return /*#__PURE__*/React.createElement("option", {
      key: value,
      value: value
    }, label);
  }), children), /*#__PURE__*/React.createElement("i", {
    className: "cr-select__chevron fa-solid fa-chevron-down",
    "aria-hidden": "true"
  }));
}
Object.assign(__ds_scope, { Select });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/forms/Select.jsx", error: String((e && e.message) || e) }); }

// components/navigation/SearchResult.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE_ID = 'cr-searchresult-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  .cr-result { display: block; width: 100%; text-align: left; background: none; border: 0;
    cursor: pointer; color: var(--fg); border-radius: var(--radius);
    padding: var(--space-2) var(--space-3); transition: background var(--transition); }
  .cr-result:hover { background: var(--accent-soft); }
  .cr-result__head { font-weight: var(--weight-semibold); font-size: var(--text-base);
    display: flex; align-items: center; gap: var(--space-2); }
  .cr-result__head i { color: var(--accent); font-size: 11px; }
  .cr-result__meta { font-size: var(--text-sm); color: var(--muted); margin-top: 2px;
    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cr-result__snippet { font-size: var(--text-sm); color: var(--muted); margin-top: 3px;
    line-height: var(--leading-ui);
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .cr-result__snippet mark { background: var(--mark-bg); color: var(--fg); border-radius: 2px; padding: 0 1px; }
  `;
  document.head.appendChild(el);
}
function SearchResult(props) {
  const {
    heading,
    docTitle,
    docPath,
    snippet,
    className = '',
    ...rest
  } = props;
  const cls = ['cr-result', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls
  }, rest), /*#__PURE__*/React.createElement("div", {
    className: "cr-result__head"
  }, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-hashtag",
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", null, heading || docTitle)), /*#__PURE__*/React.createElement("div", {
    className: "cr-result__meta"
  }, docTitle, docPath ? ` · ${docPath}` : ''), snippet != null && /*#__PURE__*/React.createElement("div", {
    className: "cr-result__snippet",
    dangerouslySetInnerHTML: {
      __html: snippet
    }
  }));
}
Object.assign(__ds_scope, { SearchResult });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/SearchResult.jsx", error: String((e && e.message) || e) }); }

// components/navigation/TreeItem.jsx
try { (() => {
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
const STYLE_ID = 'cr-treeitem-styles';
if (typeof document !== 'undefined' && !document.getElementById(STYLE_ID)) {
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = `
  .cr-tree-item { display: flex; align-items: center; gap: var(--space-2);
    width: 100%; text-align: left; background: none; border: 0; cursor: pointer;
    color: var(--fg); border-radius: var(--radius); padding: 5px var(--space-2);
    font: var(--text-ui)/var(--leading-ui) var(--font-ui);
    transition: background var(--transition), color var(--transition); }
  .cr-tree-item:hover { background: var(--accent-soft); }
  .cr-tree-item.is-active { background: var(--accent-soft); color: var(--accent); font-weight: var(--weight-semibold); }
  .cr-tree-item__icon { flex: none; width: 16px; text-align: center; color: var(--muted); font-size: 12px; }
  .cr-tree-item.is-active .cr-tree-item__icon { color: var(--accent); }
  .cr-tree-item__label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cr-tree-item__chevron { flex: none; color: var(--muted); font-size: 10px;
    transition: transform var(--transition); }
  .cr-tree-item__chevron.is-open { transform: rotate(90deg); }
  /* Folder section label variant */
  .cr-tree-folder { color: var(--muted); font-size: var(--text-label); font-weight: var(--weight-medium);
    text-transform: uppercase; letter-spacing: var(--tracking-label);
    padding: var(--space-2) var(--space-2) var(--space-1); }
  `;
  document.head.appendChild(el);
}
const KIND_ICON = {
  md: 'fa-solid fa-file-lines',
  html: 'fa-brands fa-html5',
  folder: 'fa-solid fa-folder'
};
function TreeItem(props) {
  const {
    label,
    kind = 'md',
    active = false,
    depth = 0,
    open,
    icon,
    className = '',
    ...rest
  } = props;
  const isFolder = kind === 'folder';
  const glyph = icon || KIND_ICON[kind] || KIND_ICON.md;
  const cls = ['cr-tree-item', active ? 'is-active' : '', className].filter(Boolean).join(' ');
  return /*#__PURE__*/React.createElement("button", _extends({
    type: "button",
    className: cls,
    style: {
      paddingLeft: 8 + depth * 12
    },
    title: label
  }, rest), isFolder && /*#__PURE__*/React.createElement("i", {
    className: `cr-tree-item__chevron fa-solid fa-chevron-right ${open ? 'is-open' : ''}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("i", {
    className: `cr-tree-item__icon ${glyph}`,
    "aria-hidden": "true"
  }), /*#__PURE__*/React.createElement("span", {
    className: "cr-tree-item__label"
  }, label));
}
Object.assign(__ds_scope, { TreeItem });
})(); } catch (e) { __ds_ns.__errors.push({ path: "components/navigation/TreeItem.jsx", error: String((e && e.message) || e) }); }

// ui_kits/curator/App.jsx
try { (() => {
/* Curator — interactive app shell. Owns selection + search state and wires
   the sidebar to the reading pane, inside a minimal dark window frame. */
const Sidebar = window.DVSidebar;
const Reader = window.DVReader;
function TitleBar({
  title,
  theme,
  onToggleTheme
}) {
  return /*#__PURE__*/React.createElement("div", {
    className: "dv-titlebar"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dv-lights"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dv-light dv-close"
  }), /*#__PURE__*/React.createElement("span", {
    className: "dv-light dv-min"
  }), /*#__PURE__*/React.createElement("span", {
    className: "dv-light dv-max"
  })), /*#__PURE__*/React.createElement("div", {
    className: "dv-title"
  }, title), /*#__PURE__*/React.createElement("button", {
    className: "dv-theme-toggle",
    onClick: onToggleTheme,
    title: theme === 'light' ? 'Switch to dark' : 'Switch to light',
    "aria-label": "Toggle theme"
  }, /*#__PURE__*/React.createElement("i", {
    className: theme === 'light' ? 'fa-solid fa-moon' : 'fa-solid fa-sun'
  })));
}
function App() {
  const {
    projects,
    tree,
    docs,
    sections
  } = window.DV_DATA;
  const [activeId, setActiveId] = React.useState('p1');
  const [docPath, setDocPath] = React.useState('concepts/domain-model.md');
  const [query, setQuery] = React.useState('');
  const [scrollToId, setScrollToId] = React.useState(null);
  const [theme, setTheme] = React.useState(() => localStorage.getItem('cr-theme') || 'dark');
  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cr-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');
  const activeProject = projects.find(p => p.id === activeId) || null;
  const doc = docPath ? docs[docPath] : null;
  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return sections.filter(s => (s.heading + ' ' + s.docTitle + ' ' + s.snippet).toLowerCase().includes(q));
  }, [query]);
  const onSelectProject = id => {
    setActiveId(id);
    setDocPath(null);
    setQuery('');
  };
  const openDoc = path => {
    setDocPath(path);
    setScrollToId(null);
  };
  const onOpenResult = r => {
    setDocPath(r.docPath);
    setScrollToId(r.headingId);
    setQuery('');
  };
  const titleName = activeProject ? activeProject.name : 'Curator';
  return /*#__PURE__*/React.createElement("div", {
    className: "dv-window"
  }, /*#__PURE__*/React.createElement(TitleBar, {
    title: `${titleName}${doc ? ' — ' + doc.title : ''}`,
    theme: theme,
    onToggleTheme: toggleTheme
  }), /*#__PURE__*/React.createElement("div", {
    className: "dv-body"
  }, /*#__PURE__*/React.createElement(Sidebar, {
    projects: projects,
    activeProject: activeProject,
    onSelectProject: onSelectProject,
    tree: tree,
    openDoc: openDoc,
    activePath: docPath,
    query: query,
    setQuery: setQuery,
    results: results,
    onOpenResult: onOpenResult
  }), /*#__PURE__*/React.createElement(Reader, {
    project: activeProject,
    doc: doc,
    docPath: docPath,
    scrollToId: scrollToId
  })));
}
ReactDOM.createRoot(document.getElementById('root')).render(/*#__PURE__*/React.createElement(App, null));
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/curator/App.jsx", error: String((e && e.message) || e) }); }

// ui_kits/curator/Reader.jsx
try { (() => {
/* Curator reading pane — renders a Document and its toolbar.
   Mermaid blocks are shown as a styled placeholder canvas (the real app renders
   them with mermaid + svg-pan-zoom). */
const {
  Button,
  Badge
} = window.CobaltReaderDesignSystem_feb28f;
function Reader({
  project,
  doc,
  docPath,
  scrollToId
}) {
  const ref = React.useRef(null);
  React.useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Turn ```mermaid code fences into a diagram placeholder canvas.
    root.querySelectorAll('code.language-mermaid').forEach(code => {
      const wrap = document.createElement('div');
      wrap.className = 'dv-diagram';
      wrap.innerHTML = '<div class="dv-diagram-head"><i class="fa-solid fa-diagram-project"></i> Diagram · click to expand</div>';
      const pre = code.closest('pre');
      pre.replaceWith(wrap);
    });
    if (scrollToId) {
      const el = root.querySelector('#' + CSS.escape(scrollToId));
      if (el) el.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  }, [docPath, scrollToId]);
  if (!project) {
    return /*#__PURE__*/React.createElement("main", {
      className: "dv-content dv-content--empty"
    }, /*#__PURE__*/React.createElement("div", {
      className: "dv-empty"
    }, /*#__PURE__*/React.createElement("i", {
      className: "fa-solid fa-book-open"
    }), /*#__PURE__*/React.createElement("p", {
      className: "dv-empty-title"
    }, "Add or select a project to begin"), /*#__PURE__*/React.createElement("p", {
      className: "dv-empty-sub"
    }, "Curator reads documentation from a local directory or a GitHub repository.")));
  }
  if (!doc) {
    return /*#__PURE__*/React.createElement("main", {
      className: "dv-content dv-content--empty"
    }, /*#__PURE__*/React.createElement("div", {
      className: "dv-empty"
    }, /*#__PURE__*/React.createElement("i", {
      className: "fa-solid fa-file-lines"
    }), /*#__PURE__*/React.createElement("p", {
      className: "dv-empty-title"
    }, "Select a document"), /*#__PURE__*/React.createElement("p", {
      className: "dv-empty-sub"
    }, "Pick a file from the tree, or search across ", project.name, ".")));
  }
  return /*#__PURE__*/React.createElement("main", {
    className: "dv-content"
  }, /*#__PURE__*/React.createElement("div", {
    className: "dv-toolbar"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dv-crumb"
  }, project.name, /*#__PURE__*/React.createElement("i", {
    className: "fa-solid fa-chevron-right"
  }), doc.title), /*#__PURE__*/React.createElement("div", {
    className: "dv-toolbar-actions"
  }, project.ref && /*#__PURE__*/React.createElement(Badge, {
    tone: "accent",
    icon: "fa-solid fa-code-branch"
  }, project.ref), project.type === 'github' ? /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "secondary",
    icon: "fa-solid fa-rotate"
  }, "Pull latest") : /*#__PURE__*/React.createElement(Button, {
    size: "sm",
    variant: "ghost",
    icon: "fa-solid fa-rotate"
  }, "Reindex"))), /*#__PURE__*/React.createElement("article", {
    ref: ref,
    className: "cobalt-doc dv-article",
    dangerouslySetInnerHTML: {
      __html: doc.html
    }
  }));
}
window.DVReader = Reader;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/curator/Reader.jsx", error: String((e && e.message) || e) }); }

// ui_kits/curator/Sidebar.jsx
try { (() => {
/* Curator sidebar — project switcher, search, and the document tree.
   Composes the DS primitives: Select, IconButton, Input, TreeItem, SearchResult, Badge. */
const {
  Select,
  IconButton,
  Input,
  TreeItem,
  SearchResult,
  Badge
} = window.CobaltReaderDesignSystem_feb28f;
function StatusBadge({
  status
}) {
  if (status === 'building') return /*#__PURE__*/React.createElement(Badge, {
    tone: "warning",
    dot: true
  }, "Building");
  if (status === 'error') return /*#__PURE__*/React.createElement(Badge, {
    tone: "error",
    dot: true
  }, "Error");
  return /*#__PURE__*/React.createElement(Badge, {
    tone: "success",
    dot: true
  }, "Ready");
}
function Tree({
  nodes,
  openDoc,
  activePath,
  depth
}) {
  const [open, setOpen] = React.useState({});
  return nodes.map(node => {
    if (node.type === 'folder') {
      const isOpen = open[node.path] ?? true;
      return /*#__PURE__*/React.createElement("div", {
        key: node.path
      }, /*#__PURE__*/React.createElement(TreeItem, {
        kind: "folder",
        label: node.name,
        depth: depth,
        open: isOpen,
        onClick: () => setOpen(o => ({
          ...o,
          [node.path]: !isOpen
        }))
      }), isOpen && /*#__PURE__*/React.createElement(Tree, {
        nodes: node.children,
        openDoc: openDoc,
        activePath: activePath,
        depth: depth + 1
      }));
    }
    return /*#__PURE__*/React.createElement(TreeItem, {
      key: node.path,
      kind: node.kind,
      label: node.title,
      depth: depth,
      active: activePath === node.path,
      onClick: () => openDoc(node.path)
    });
  });
}
function Sidebar({
  projects,
  activeProject,
  onSelectProject,
  tree,
  openDoc,
  activePath,
  query,
  setQuery,
  results,
  onOpenResult
}) {
  const searching = query.trim().length > 0;
  return /*#__PURE__*/React.createElement("aside", {
    className: "dv-sidebar"
  }, /*#__PURE__*/React.createElement("header", {
    className: "dv-side-head"
  }, /*#__PURE__*/React.createElement(Select, {
    flush: true,
    value: activeProject ? activeProject.id : '',
    onChange: e => onSelectProject(e.target.value),
    placeholder: "Select a project\u2026",
    options: projects.map(p => ({
      value: p.id,
      label: p.name
    }))
  }), /*#__PURE__*/React.createElement(IconButton, {
    icon: "fa-solid fa-plus",
    label: "Add a project"
  })), activeProject && /*#__PURE__*/React.createElement("div", {
    className: "dv-proj-meta"
  }, /*#__PURE__*/React.createElement("span", {
    className: "dv-proj-sub"
  }, /*#__PURE__*/React.createElement("i", {
    className: activeProject.type === 'github' ? 'fa-brands fa-github' : 'fa-solid fa-folder-open'
  }), activeProject.sub), /*#__PURE__*/React.createElement(StatusBadge, {
    status: activeProject.status
  })), /*#__PURE__*/React.createElement("div", {
    className: "dv-search"
  }, /*#__PURE__*/React.createElement(Input, {
    flush: true,
    type: "search",
    icon: "fa-solid fa-magnifying-glass",
    placeholder: "Search docs\u2026",
    value: query,
    onChange: e => setQuery(e.target.value),
    disabled: !activeProject
  })), /*#__PURE__*/React.createElement("div", {
    className: "dv-scroll"
  }, !activeProject ? /*#__PURE__*/React.createElement("div", {
    className: "dv-empty-side"
  }, "No project selected.") : searching ? results.length ? results.map(r => /*#__PURE__*/React.createElement(SearchResult, {
    key: r.docPath + r.headingId,
    heading: r.heading,
    docTitle: r.docTitle,
    docPath: r.docPath,
    snippet: r.snippet,
    onClick: () => onOpenResult(r)
  })) : /*#__PURE__*/React.createElement("div", {
    className: "dv-empty-side"
  }, "No matches.") : /*#__PURE__*/React.createElement(Tree, {
    nodes: tree,
    openDoc: openDoc,
    activePath: activePath,
    depth: 0
  })));
}
window.DVSidebar = Sidebar;
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/curator/Sidebar.jsx", error: String((e && e.message) || e) }); }

// ui_kits/curator/data.js
try { (() => {
/* Fake data for the Curator UI kit — modeled on the real app's domain
   (Projects, Documents, Sections, Refs) and its own CONTEXT.md content. */
(function () {
  const projects = [{
    id: 'p1',
    name: 'Curator',
    type: 'local',
    docCount: 18,
    status: 'ok',
    sub: 'Local · ~/projects/curator'
  }, {
    id: 'p2',
    name: 'React',
    type: 'github',
    docCount: 342,
    status: 'ok',
    ref: 'main',
    sub: 'github.com/reactjs/react.dev'
  }, {
    id: 'p3',
    name: 'Tailwind CSS',
    type: 'github',
    docCount: 211,
    status: 'building',
    ref: 'v4',
    sub: 'Pull latest in progress…'
  }];
  const tree = [{
    type: 'doc',
    path: 'README.md',
    title: 'Overview',
    kind: 'md'
  }, {
    type: 'folder',
    name: 'concepts',
    path: 'concepts',
    children: [{
      type: 'doc',
      path: 'concepts/domain-model.md',
      title: 'Domain model',
      kind: 'md'
    }, {
      type: 'doc',
      path: 'concepts/projects.md',
      title: 'Projects & sources',
      kind: 'md'
    }, {
      type: 'doc',
      path: 'concepts/search.md',
      title: 'Search & sections',
      kind: 'md'
    }]
  }, {
    type: 'folder',
    name: 'adr',
    path: 'adr',
    children: [{
      type: 'doc',
      path: 'adr/0001-electron.md',
      title: '0001 · Use Electron',
      kind: 'md'
    }, {
      type: 'doc',
      path: 'adr/0002-themes.md',
      title: '0002 · Theme system',
      kind: 'md'
    }]
  }, {
    type: 'doc',
    path: 'coverage.html',
    title: 'coverage report',
    kind: 'html'
  }];
  const docs = {
    'README.md': {
      title: 'Overview',
      html: `
        <h1>Curator</h1>
        <p>A desktop app for browsing, navigating, and searching documentation drawn from
        local directories or GitHub repositories, one selectable <a href="#">Project</a> at a time.</p>
        <h2 id="what">What it does</h2>
        <p>Point Curator at a folder or a repo and it discovers every markdown file,
        splits each <mark>Document</mark> into searchable Sections, and renders it with
        live diagrams and full-text search.</p>
        <ul>
          <li>Local directories stay current via a file-watcher.</li>
          <li>GitHub Projects cache multiple <strong>Refs</strong> and switch between them.</li>
          <li>A per-Project Theme can override the global look.</li>
        </ul>
        <h2 id="quickstart">Quick start</h2>
        <pre><code>$ curator ./docs
Indexed 18 documents · 142 sections
Watching for changes…</code></pre>
        <blockquote>Local content is read live — there is nothing to fetch. "Reindex" just
        rebuilds the in-memory nav tree and Section index.</blockquote>
      `
    },
    'concepts/domain-model.md': {
      title: 'Domain model',
      html: `
        <h1>Domain model</h1>
        <p>The vocabulary Curator is built around. A <mark>Project</mark> is the top-level
        unit; everything else hangs off it.</p>
        <h2 id="entities">Core entities</h2>
        <table>
          <thead><tr><th>Term</th><th>Definition</th></tr></thead>
          <tbody>
            <tr><td>Project</td><td>A named documentation source plus its processed doc set and search index.</td></tr>
            <tr><td>Document</td><td>A single viewable file surfaced within a Project.</td></tr>
            <tr><td>Section</td><td>A heading-delimited chunk of a Document — the unit of search.</td></tr>
            <tr><td>Ref</td><td>A git branch, tag, or commit of a GitHub Project's repo.</td></tr>
          </tbody>
        </table>
        <h2 id="relationships">Relationships</h2>
        <pre><code class="language-mermaid">graph LR
  Project --> Document
  Document --> Section
  Project --> Ref</code></pre>
        <h3 id="rebuild">Rebuild</h3>
        <p>One internal operation, two surface labels: <strong>Pull latest</strong> for GitHub
        (re-clones remote content) and <strong>Reindex</strong> for local (rebuilds the index).</p>
      `
    },
    'concepts/projects.md': {
      title: 'Projects & sources',
      html: `
        <h1>Projects &amp; sources</h1>
        <p>A <mark>Project</mark> has exactly one source: a local directory or a GitHub repo.
        Its identity excludes its Ref — the same repo on two branches is one Project.</p>
        <h2 id="local">Local projects</h2>
        <p>Content is read live from disk and kept current by a file-watcher. Use
        <strong>Reindex</strong> only as a recovery action.</p>
        <h2 id="github">GitHub projects</h2>
        <p>Cloned and cached per Ref. The branch switcher moves between cached Refs;
        <strong>Pull latest</strong> re-fetches the current Ref.</p>
      `
    },
    'concepts/search.md': {
      title: 'Search & sections',
      html: `
        <h1>Search &amp; sections</h1>
        <p>Each <mark>Section</mark> is one search record. A result points at one Section's
        heading anchor, so opening it scrolls straight to the match.</p>
        <h2 id="sections">What counts as a Section</h2>
        <p>Documents are split at H1–H3 boundaries. Content before the first heading is an
        intro Section anchored to the top.</p>
        <pre><code>minisearch.search("rebuild", { prefix: true, fuzzy: 0.2 })</code></pre>
      `
    },
    'adr/0001-electron.md': {
      title: '0001 · Use Electron',
      html: `
        <h1>ADR 0001 — Use Electron</h1>
        <p><strong>Status:</strong> Accepted</p>
        <h2 id="context">Context</h2>
        <p>We need a cross-platform desktop app with local filesystem access and a web
        rendering surface for markdown and diagrams.</p>
        <h2 id="decision">Decision</h2>
        <p>Build on Electron with a Vite + React renderer and a typed preload bridge.</p>
      `
    },
    'adr/0002-themes.md': {
      title: '0002 · Theme system',
      html: `
        <h1>ADR 0002 — Theme system</h1>
        <p><strong>Status:</strong> Accepted</p>
        <h2 id="context">Context</h2>
        <p>Users want visual distinction between Projects and a comfortable reading surface.</p>
        <h2 id="decision">Decision</h2>
        <p>A Theme is a palette of CSS custom-property overrides, applied globally and
        optionally per-Project. <em>Cobalt Reader</em> is one such Theme.</p>
      `
    }
  };

  // Flattened sections for search.
  const sections = [{
    docPath: 'concepts/domain-model.md',
    docTitle: 'Domain model',
    heading: 'Rebuild',
    headingId: 'rebuild',
    snippet: 'One internal operation, two surface labels: <mark>Pull latest</mark> for GitHub and Reindex for local.'
  }, {
    docPath: 'concepts/projects.md',
    docTitle: 'Projects & sources',
    heading: 'GitHub projects',
    headingId: 'github',
    snippet: 'Cloned and cached per <mark>Ref</mark>. Pull latest re-fetches the current Ref.'
  }, {
    docPath: 'concepts/search.md',
    docTitle: 'Search & sections',
    heading: 'What counts as a Section',
    headingId: 'sections',
    snippet: 'Documents are split at H1–H3 boundaries. Content before the first heading is an intro <mark>Section</mark>.'
  }, {
    docPath: 'concepts/domain-model.md',
    docTitle: 'Domain model',
    heading: 'Core entities',
    headingId: 'entities',
    snippet: 'A <mark>Section</mark> is a heading-delimited chunk of a Document — the unit of search.'
  }, {
    docPath: 'README.md',
    docTitle: 'Overview',
    heading: 'What it does',
    headingId: 'what',
    snippet: 'Splits each Document into searchable <mark>Sections</mark> and renders it with live diagrams.'
  }];
  window.DV_DATA = {
    projects,
    tree,
    docs,
    sections
  };
})();
})(); } catch (e) { __ds_ns.__errors.push({ path: "ui_kits/curator/data.js", error: String((e && e.message) || e) }); }

__ds_ns.Badge = __ds_scope.Badge;

__ds_ns.Card = __ds_scope.Card;

__ds_ns.Button = __ds_scope.Button;

__ds_ns.IconButton = __ds_scope.IconButton;

__ds_ns.Input = __ds_scope.Input;

__ds_ns.Select = __ds_scope.Select;

__ds_ns.SearchResult = __ds_scope.SearchResult;

__ds_ns.TreeItem = __ds_scope.TreeItem;

})();
