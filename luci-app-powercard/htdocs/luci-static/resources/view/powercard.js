'use strict';
'require rpc';
'require view';

/*
 * LuCI view for the ESP8266 PC PowerCard.
 *
 * The browser calls the local rpcd object "powercard" (same origin);
 * /usr/libexec/rpcd/powercard forwards the requests to the card's
 * HTTP API, so no CORS support is needed on the ESP8266 firmware.
 */

var callStatus = rpc.declare({
	object: 'powercard',
	method: 'status'
});

var callGetConfig = rpc.declare({
	object: 'powercard',
	method: 'get_config'
});

var callSetConfig = rpc.declare({
	object: 'powercard',
	method: 'set_config',
	params: ['ip', 'port', 'timeout']
});

var callPower = rpc.declare({
	object: 'powercard',
	method: 'power',
	params: ['type', 'ms']
});

var callReset = rpc.declare({
	object: 'powercard',
	method: 'reset'
});

var callClearWifi = rpc.declare({
	object: 'powercard',
	method: 'clear_wifi'
});

/*
 * Reuse the original config RPC for the newer settings as well.  Apart from
 * keeping all persisted settings in one response, this is important during
 * upgrades: an existing LuCI login session already grants get_config and
 * set_config, but its cached ACL may not contain the newer RPC method names.
 */
var callSetScheduleConfig = rpc.declare({
	object: 'powercard',
	method: 'set_config',
	params: ['rules', 'precheck']
});

var callSetWatchdogConfig = rpc.declare({
	object: 'powercard',
	method: 'set_config',
	params: ['watchdog_enabled', 'watchdog_minutes']
});

var pollTimer = null;
var wdTimer = null;

var STYLES =
'#pcapp, #pcapp * {' +
'	box-sizing: border-box;' +
'	margin: 0;' +
'	padding: 0;' +
'}' +
'#pcapp {' +
'	font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;' +
'	background: #f0f2f5;' +
'	max-width: 520px;' +
'	margin: 0 auto;' +
'	padding: 16px;' +
'	padding-bottom: 60px;' +
'	color: #1a1a2e;' +
'}' +
'#pcapp .hdr {' +
'	display: flex;' +
'	align-items: center;' +
'	justify-content: space-between;' +
'	margin-bottom: 20px;' +
'	padding: 8px 4px;' +
'}' +
'#pcapp .hdr h1 {' +
'	font-size: 20px;' +
'	color: #1a1a2e;' +
'}' +
'#pcapp .hdr .conn {' +
'	font-size: 12px;' +
'	color: #666;' +
'	display: flex;' +
'	align-items: center;' +
'	gap: 6px;' +
'}' +
'#pcapp .dot {' +
'	width: 8px;' +
'	height: 8px;' +
'	border-radius: 50%;' +
'	background: #10b981;' +
'	display: inline-block;' +
'}' +
'#pcapp .dot.off { background: #9ca3af; }' +
'#pcapp .dot.err { background: #ef4444; }' +
'#pcapp .card {' +
'	background: #fff;' +
'	border-radius: 16px;' +
'	box-shadow: 0 2px 12px rgba(0,0,0,.06);' +
'	padding: 22px;' +
'	margin-bottom: 16px;' +
'}' +
'#pcapp .status-card {' +
'	display: flex;' +
'	align-items: center;' +
'	gap: 16px;' +
'}' +
'#pcapp .status-icon {' +
'	width: 72px;' +
'	height: 72px;' +
'	border-radius: 50%;' +
'	display: flex;' +
'	align-items: center;' +
'	justify-content: center;' +
'	font-size: 34px;' +
'	background: #eef2ff;' +
'	flex-shrink: 0;' +
'	transition: .4s all;' +
'}' +
'#pcapp .status-icon.on {' +
'	background: linear-gradient(135deg, #10b981, #059669);' +
'	transform: scale(1);' +
'	animation: pcPulseOn 2s infinite;' +
'}' +
'#pcapp .status-icon.off {' +
'	background: linear-gradient(135deg, #9ca3af, #6b7280);' +
'}' +
'@keyframes pcPulseOn {' +
'	0%, 100% { box-shadow: 0 0 0 0 rgba(16,185,129,.5); }' +
'	70% { box-shadow: 0 0 0 16px rgba(16,185,129,0); }' +
'}' +
'#pcapp .status-text h2 {' +
'	font-size: 24px;' +
'	color: #111;' +
'	font-weight: 700;' +
'}' +
'#pcapp .status-text p {' +
'	font-size: 13px;' +
'	color: #6b7280;' +
'	margin-top: 4px;' +
'}' +
'#pcapp .section-title {' +
'	font-size: 13px;' +
'	color: #6b7280;' +
'	font-weight: 600;' +
'	margin-bottom: 12px;' +
'	letter-spacing: 1px;' +
'}' +
'#pcapp .btn-grid {' +
'	display: grid;' +
'	grid-template-columns: 1fr 1fr;' +
'	gap: 12px;' +
'}' +
'#pcapp .b-btn {' +
'	padding: 18px 14px;' +
'	border: none;' +
'	border-radius: 14px;' +
'	font-size: 15px;' +
'	font-weight: 600;' +
'	cursor: pointer;' +
'	transition: .15s all;' +
'	color: #fff;' +
'	letter-spacing: .5px;' +
'}' +
'#pcapp .b-btn:active { transform: scale(.97); }' +
'#pcapp .b-btn:disabled {' +
'	opacity: .45;' +
'	cursor: not-allowed;' +
'	filter: grayscale(.3);' +
'}' +
'#pcapp .b-on {' +
'	background: linear-gradient(135deg, #10b981, #059669);' +
'	box-shadow: 0 6px 20px rgba(16,185,129,.35);' +
'}' +
'#pcapp .b-off {' +
'	background: linear-gradient(135deg, #ef4444, #dc2626);' +
'	box-shadow: 0 6px 20px rgba(239,68,68,.35);' +
'}' +
'#pcapp .b-force {' +
'	background: linear-gradient(135deg, #f59e0b, #d97706);' +
'	box-shadow: 0 6px 20px rgba(245,158,11,.35);' +
'}' +
'#pcapp .b-custom {' +
'	background: linear-gradient(135deg, #6366f1, #4f46e5);' +
'	box-shadow: 0 6px 20px rgba(99,102,241,.35);' +
'}' +
'#pcapp .full { grid-column: span 2; }' +
'#pcapp .addr-row {' +
'	display: flex;' +
'	gap: 10px;' +
'	align-items: center;' +
'}' +
'#pcapp .addr-row input {' +
'	flex: 1;' +
'	padding: 10px 14px;' +
'	border: 1px solid #e5e7eb;' +
'	border-radius: 10px;' +
'	font-size: 14px;' +
'	outline: none;' +
'	font-family: ui-monospace, Consolas, monospace;' +
'}' +
'#pcapp .addr-row input:focus { border-color: #6366f1; }' +
'#pcapp .addr-save {' +
'	padding: 10px 22px;' +
'	border: none;' +
'	border-radius: 10px;' +
'	background: linear-gradient(135deg, #6366f1, #4f46e5);' +
'	color: #fff;' +
'	font-size: 14px;' +
'	font-weight: 600;' +
'	cursor: pointer;' +
'	white-space: nowrap;' +
'}' +
'#pcapp .addr-save:active { transform: scale(.97); }' +
'#pcapp .addr-save:disabled { opacity: .5; cursor: default; }' +
'#pcapp .custom-row {' +
'	display: flex;' +
'	gap: 10px;' +
'	margin-top: -4px;' +
'	align-items: center;' +
'}' +
'#pcapp .custom-row input {' +
'	flex: 1;' +
'	padding: 10px 14px;' +
'	border: 1px solid #e5e7eb;' +
'	border-radius: 10px;' +
'	font-size: 14px;' +
'	outline: none;' +
'}' +
'#pcapp .custom-row input:focus { border-color: #6366f1; }' +
'#pcapp .custom-row span {' +
'	color: #6b7280;' +
'	font-size: 13px;' +
'	white-space: nowrap;' +
'}' +
'#pcapp .info-grid {' +
'	display: grid;' +
'	grid-template-columns: 120px 1fr;' +
'	gap: 10px 14px;' +
'	font-size: 13px;' +
'}' +
'#pcapp .info-grid .k { color: #9ca3af; }' +
'#pcapp .info-grid .v {' +
'	color: #374151;' +
'	font-family: ui-monospace, Consolas, monospace;' +
'	word-break: break-all;' +
'}' +
'#pcapp .danger-row {' +
'	display: grid;' +
'	grid-template-columns: 1fr 1fr;' +
'	gap: 10px;' +
'	margin-top: 16px;' +
'}' +
'#pcapp .danger-row button {' +
'	padding: 10px;' +
'	border: 1px solid #e5e7eb;' +
'	background: #fff;' +
'	border-radius: 10px;' +
'	font-size: 13px;' +
'	cursor: pointer;' +
'	color: #374151;' +
'}' +
'#pcapp .danger-row button.red {' +
'	color: #dc2626;' +
'	border-color: #fecaca;' +
'}' +
'#pcapp .danger-row button:active { background: #f9fafb; }' +
'#pcapp .toast {' +
'	position: fixed;' +
'	top: 24px;' +
'	left: 50%;' +
'	transform: translateX(-50%);' +
'	padding: 12px 20px;' +
'	border-radius: 10px;' +
'	color: #fff;' +
'	font-size: 14px;' +
'	box-shadow: 0 10px 30px rgba(0,0,0,.2);' +
'	z-index: 999;' +
'	opacity: 0;' +
'	transition: .3s;' +
'	pointer-events: none;' +
'	max-width: 90%;' +
'	text-align: center;' +
'}' +
'#pcapp .toast.show { opacity: 1; }' +
'#pcapp .toast.ok { background: #10b981; }' +
'#pcapp .toast.err { background: #ef4444; }' +
'#pcapp .busy-mask {' +
'	position: fixed;' +
'	inset: 0;' +
'	background: rgba(0,0,0,.25);' +
'	display: none;' +
'	align-items: center;' +
'	justify-content: center;' +
'	z-index: 500;' +
'}' +
'#pcapp .busy-mask.show { display: flex; }' +
'#pcapp .busy-box {' +
'	background: #fff;' +
'	padding: 20px 28px;' +
'	border-radius: 14px;' +
'	display: flex;' +
'	align-items: center;' +
'	gap: 14px;' +
'	font-size: 15px;' +
'	color: #333;' +
'	font-weight: 500;' +
'}' +
'#pcapp .spin {' +
'	width: 20px;' +
'	height: 20px;' +
'	border: 3px solid #e5e7eb;' +
'	border-top-color: #6366f1;' +
'	border-radius: 50%;' +
'	animation: pcSpin .8s infinite linear;' +
'}' +
'@keyframes pcSpin { to { transform: rotate(360deg); } }' +
'#pcapp .hint-tip {' +
'	background: #fffbeb;' +
'	color: #92400e;' +
'	font-size: 12px;' +
'	padding: 8px 12px;' +
'	border-radius: 8px;' +
'	margin-top: 10px;' +
'	line-height: 1.5;' +
'}' +
'#pcapp .hw-debug {' +
'	background: #f8fafc;' +
'	border: 1px solid #e5e7eb;' +
'	border-radius: 10px;' +
'	padding: 12px;' +
'	margin-top: 14px;' +
'	font-size: 12px;' +
'	color: #64748b;' +
'	line-height: 1.7;' +
'}' +
'#pcapp .hw-debug b { color: #334155; }' +
'#pcapp .sched-item {' +
'	border: 1px solid #e5e7eb;' +
'	border-radius: 12px;' +
'	padding: 12px;' +
'	margin-bottom: 10px;' +
'	background: #fafafa;' +
'}' +
'#pcapp .sched-item.disabled { opacity: .55; }' +
'#pcapp .sched-row {' +
'	display: flex;' +
'	gap: 8px;' +
'	align-items: center;' +
'	flex-wrap: wrap;' +
'}' +
'#pcapp .sched-row input[type="time"] {' +
'	padding: 8px 10px;' +
'	border: 1px solid #e5e7eb;' +
'	border-radius: 10px;' +
'	font-size: 14px;' +
'	outline: none;' +
'	background: #fff;' +
'	font-family: ui-monospace, Consolas, monospace;' +
'}' +
'#pcapp .sched-row input[type="time"]:focus,' +
'#pcapp .sched-row select:focus { border-color: #6366f1; }' +
'#pcapp .sched-row select {' +
'	padding: 8px 10px;' +
'	border: 1px solid #e5e7eb;' +
'	border-radius: 10px;' +
'	font-size: 14px;' +
'	outline: none;' +
'	background: #fff;' +
'	color: #374151;' +
'}' +
'#pcapp .sched-del {' +
'	margin-left: auto;' +
'	border: none;' +
'	background: none;' +
'	color: #dc2626;' +
'	font-size: 18px;' +
'	cursor: pointer;' +
'	padding: 4px 8px;' +
'	line-height: 1;' +
'}' +
'#pcapp .sched-days {' +
'	display: flex;' +
'	gap: 4px;' +
'	margin-top: 8px;' +
'}' +
'#pcapp .sched-days button {' +
'	flex: 1;' +
'	padding: 6px 0;' +
'	border: 1px solid #e5e7eb;' +
'	border-radius: 8px;' +
'	background: #fff;' +
'	color: #6b7280;' +
'	font-size: 12px;' +
'	cursor: pointer;' +
'	transition: .12s all;' +
'}' +
'#pcapp .sched-days button.sel {' +
'	background: #6366f1;' +
'	border-color: #6366f1;' +
'	color: #fff;' +
'	font-weight: 600;' +
'}' +
'#pcapp .sched-toggle {' +
'	display: flex;' +
'	align-items: center;' +
'	gap: 6px;' +
'	font-size: 12px;' +
'	color: #6b7280;' +
'	cursor: pointer;' +
'	user-select: none;' +
'}' +
'#pcapp .sched-add {' +
'	width: 100%;' +
'	padding: 12px;' +
'	border: 1px dashed #c7d2fe;' +
'	border-radius: 12px;' +
'	background: #eef2ff;' +
'	color: #4f46e5;' +
'	font-size: 14px;' +
'	font-weight: 600;' +
'	cursor: pointer;' +
'	margin-bottom: 12px;' +
'}' +
'#pcapp .sched-add:active { transform: scale(.98); }' +
'#pcapp .sched-empty {' +
'	text-align: center;' +
'	color: #9ca3af;' +
'	font-size: 13px;' +
'	padding: 10px 0 14px;' +
'}' +
'#pcapp .sched-save {' +
'	width: 100%;' +
'	padding: 14px;' +
'	border: none;' +
'	border-radius: 12px;' +
'	background: linear-gradient(135deg, #6366f1, #4f46e5);' +
'	box-shadow: 0 6px 20px rgba(99,102,241,.35);' +
'	color: #fff;' +
'	font-size: 15px;' +
'	font-weight: 600;' +
'	cursor: pointer;' +
'}' +
'#pcapp .sched-save:active { transform: scale(.98); }' +
'#pcapp .sched-save:disabled { opacity: .5; cursor: default; }' +
'#pcapp .sched-summary {' +
'	margin-top: 8px;' +
'	font-size: 12px;' +
'	color: #6b7280;' +
'}' +
'/* Native time inputs stay white-on-white in LuCI dark themes. */' +
'#pcapp input[type="time"] { color-scheme: light dark; }' +
'#pcapp .wd-row {' +
'	display: flex;' +
'	gap: 10px;' +
'	align-items: center;' +
'	flex-wrap: wrap;' +
'}' +
'#pcapp .wd-row input[type="number"] {' +
'	width: 90px;' +
'	padding: 10px 14px;' +
'	border: 1px solid #e5e7eb;' +
'	border-radius: 10px;' +
'	font-size: 14px;' +
'	outline: none;' +
'	background: #fff;' +
'	color: #374151;' +
'}' +
'#pcapp .wd-row input[type="number"]:focus { border-color: #6366f1; }' +
'#pcapp .wd-row span { color: #6b7280; font-size: 13px; }' +
'#pcapp .wd-switch {' +
'	display: flex;' +
'	align-items: center;' +
'	gap: 8px;' +
'	font-size: 14px;' +
'	color: #374151;' +
'	cursor: pointer;' +
'	user-select: none;' +
'	margin-bottom: 12px;' +
'	font-weight: 600;' +
'}' +
'#pcapp .wd-switch input {' +
'	width: 18px;' +
'	height: 18px;' +
'	accent-color: #6366f1;' +
'	cursor: pointer;' +
'}' +
'#pcapp .wd-state {' +
'	margin-top: 10px;' +
'	font-size: 12px;' +
'	color: #92400e;' +
'	background: #fffbeb;' +
'	border-radius: 8px;' +
'	padding: 8px 12px;' +
'	display: none;' +
'}' +
'#pcapp .wd-state.show { display: block; }' +
'#pcapp .wd-save {' +
'	margin-top: 12px;' +
'	padding: 10px 22px;' +
'	border: none;' +
'	border-radius: 10px;' +
'	background: linear-gradient(135deg, #6366f1, #4f46e5);' +
'	color: #fff;' +
'	font-size: 14px;' +
'	font-weight: 600;' +
'	cursor: pointer;' +
'	white-space: nowrap;' +
'}' +
'#pcapp .wd-save:active { transform: scale(.97); }' +
'#pcapp .wd-save:disabled { opacity: .5; cursor: default; }' +
'#pcapp .footer {' +
'	text-align: center;' +
'	font-size: 11px;' +
'	color: #9ca3af;' +
'	margin-top: 16px;' +
'}' +
'@media (max-width: 420px) {' +
'	#pcapp .info-grid { grid-template-columns: 100px 1fr; }' +
'	#pcapp .addr-row,' +
'	#pcapp .custom-row {' +
'		flex-direction: column;' +
'		align-items: stretch;' +
'	}' +
'	#pcapp .addr-save { width: 100%; }' +
'	#pcapp .custom-row span { text-align: center; }' +
'}';

var MARKUP =
'<style>' + STYLES + '</style>' +

'<div class="hdr">' +
'	<h1>💻 电脑开机卡</h1>' +
'	<div class="conn">' +
'		<span class="dot" id="connDot"></span>' +
'		<span id="connText">连接中</span>' +
'	</div>' +
'</div>' +

'<div class="card">' +
'	<div class="section-title">📡 设备地址</div>' +
'	<div class="addr-row">' +
'		<input id="cfgIp" type="text" inputmode="decimal" placeholder="192.168.58.246" autocomplete="off" spellcheck="false">' +
'		<button class="addr-save" id="btnSaveAddr">保存</button>' +
'	</div>' +
'	<div class="hint-tip">ℹ️ 开机卡通过 DHCP 获取 IP，地址变化后在此填写新 IP 并保存即可。</div>' +
'</div>' +

'<div class="card status-card">' +
'	<div class="status-icon" id="stIcon">⏻</div>' +
'	<div class="status-text">' +
'		<h2 id="stText">读取中...</h2>' +
'		<p id="stSub">正在检测电脑电源状态</p>' +
'	</div>' +
'</div>' +

'<div class="card">' +
'	<div class="section-title">⚡ 电源控制</div>' +
'	<div class="btn-grid">' +
'		<button class="b-btn b-on" id="btnOn">' +
'			<div style="font-size:22px;margin-bottom:4px">🔋</div>' +
'			开机' +
'			<div style="font-size:11px;opacity:.85;margin-top:4px">POWER 短按 0.5s</div>' +
'		</button>' +
'		<button class="b-btn b-off" id="btnOff">' +
'			<div style="font-size:22px;margin-bottom:4px">⛔</div>' +
'			关机' +
'			<div style="font-size:11px;opacity:.85;margin-top:4px">正常软关机</div>' +
'		</button>' +
'		<button class="b-btn b-force full" id="btnForce">' +
'			<div style="font-size:20px;margin-bottom:4px">⚠️</div>' +
'			强制关机 6s' +
'			<div style="font-size:11px;opacity:.9;margin-top:4px">死机 / 蓝屏 / 无响应时使用</div>' +
'		</button>' +
'		<button class="b-btn b-custom full" id="btnCustom">🎛 自定义 POWER 按键时间</button>' +
'		<div class="custom-row full">' +
'			<input id="cusMs" type="number" min="100" max="15000" step="100" value="2000">' +
'			<span>毫秒（100 ~ 15000）</span>' +
'		</div>' +
'	</div>' +
'	<div class="hint-tip">' +
'		ℹ️ 开机：GPIO12 拉高 500ms。<br>' +
'		关机：GPIO12 拉高 500ms，触发主板 ACPI 正常关机。<br>' +
'		强制关机：GPIO12 持续拉高 6 秒。' +
'	</div>' +
'</div>' +

'<div class="card">' +
'	<div class="section-title">🛡 关机保护（强制断电兜底）</div>' +
'	<label class="wd-switch">' +
'		<input type="checkbox" id="wdEnabled"> 启用关机保护' +
'	</label>' +
'	<div class="wd-row">' +
'		<span>软关机后等待</span>' +
'		<input id="wdMinutes" type="number" min="1" max="180" step="1" value="10">' +
'		<span>分钟，若电脑仍未关机则强制断电</span>' +
'	</div>' +
'	<div class="wd-state" id="wdState"></div>' +
'	<button class="wd-save" id="btnWdSave">💾 保存关机保护设置</button>' +
'	<div class="hint-tip">' +
'		ℹ️ 适用于"系统已关闭但主机风扇仍转"的情况。<br>' +
'		手动点击"关机"或定时关机后自动开始计时，到点若开机卡仍检测到电脑通电，会自动长按 POWER 6 秒强制断电。<br>' +
'		期间手动开机或强制关机会自动取消计时。计时由路由器 cron 每分钟检查一次，路由器重启后计时自动清零。' +
'	</div>' +
'</div>' +

'<div class="card">' +
'	<div class="section-title">⏰ 定时开关机</div>' +
'	<div id="schedList"></div>' +
'	<div class="sched-empty" id="schedEmpty" style="display:none">还没有定时规则，点击下方按钮添加</div>' +
'	<button class="sched-add" id="btnSchedAdd">＋ 添加定时规则</button>' +
'	<label class="wd-switch" style="margin-top:2px">' +
'		<input type="checkbox" id="schedPrecheck"> 执行前检查电脑状态（已开机跳过开机、已关机跳过关机）' +
'	</label>' +
'	<button class="sched-save" id="btnSchedSave">💾 保存全部定时规则</button>' +
'	<div class="hint-tip">' +
'		ℹ️ 定时任务由路由器的 cron 执行，保存后生效。<br>' +
'		电源键是单一动作：已开机时再按会关机、已关机时再按会开机，因此建议保持"执行前检查"开启，状态已符合时自动跳过。<br>' +
'		开机卡离线时定时任务会跳过并记录日志，不会盲发指令；"强制关机"始终执行。<br>' +
'		路由器重启后 crontab 会自动恢复。' +
'	</div>' +
'</div>' +

'<div class="card">' +
'	<div class="section-title">🔌 硬件状态</div>' +
'	<div class="hw-debug">' +
'		<div><b>GPIO12 POWER_OUT：</b><span id="gpio12">—</span></div>' +
'		<div><b>GPIO13 STATUS_IN：</b><span id="gpio13">—</span></div>' +
'		<div><b>POWER 按键状态：</b><span id="keyState">—</span></div>' +
'		<div><b>电脑状态：</b><span id="pcStateDebug">—</span></div>' +
'	</div>' +
'</div>' +

'<div class="card">' +
'	<div class="section-title">📊 设备信息</div>' +
'	<div class="info-grid">' +
'		<div class="k">WiFi 信号</div><div class="v" id="iRssi">—</div>' +
'		<div class="k">IP 地址</div><div class="v" id="iIp">—</div>' +
'		<div class="k">空闲内存</div><div class="v" id="iHeap">—</div>' +
'		<div class="k">运行时长</div><div class="v" id="iUptime">—</div>' +
'	</div>' +
'	<div class="danger-row">' +
'		<button id="btnReset">🔄 重启开机卡</button>' +
'		<button class="red" id="btnClearWifi">🗑 清除 WiFi</button>' +
'	</div>' +
'</div>' +

'<div class="footer">ESP8266 PC PowerCard<br>GPIO12 = POWER SW · GPIO13 = POWER LED</div>' +

'<div id="toast" class="toast"></div>' +
'<div id="busy" class="busy-mask">' +
'	<div class="busy-box">' +
'		<div class="spin"></div>' +
'		<span id="busyText">执行中...</span>' +
'	</div>' +
'</div>';

return view.extend({
	title: '电脑开机卡',

	render: function () {
		if (pollTimer) {
			clearInterval(pollTimer);
			pollTimer = null;
		}
		if (wdTimer) {
			clearInterval(wdTimer);
			wdTimer = null;
		}

		var root = E('div', { id: 'pcapp', class: 'wrap' });
		root.innerHTML = MARKUP;
		this._wire(root);

		setTimeout(this.refresh.bind(this), 50);
		setTimeout(this.loadConfig.bind(this), 50);
		setTimeout(this.loadSchedule.bind(this), 60);
		setTimeout(this.loadWatchdog.bind(this), 60);
		pollTimer = setInterval(this.refresh.bind(this), 3000);

		return root;
	},

	_wire: function (root) {
		this.root = root;
		this.$ = function (id) {
			return root.querySelector('#' + id);
		};

		this.state = {
			pcOn: null,
			pcSleep: false,
			keyBusy: false,
			gpio12: null,
			gpio13: null,
			lastFetch: 0
		};

		this.schedRules = [];

		this.$('btnOn').addEventListener('click', function () { this.doAction('on'); }.bind(this));
		this.$('btnOff').addEventListener('click', function () { this.doAction('off'); }.bind(this));
		this.$('btnForce').addEventListener('click', function () { this.doAction('force'); }.bind(this));
		this.$('btnCustom').addEventListener('click', this.doCustomAction.bind(this));
		this.$('btnReset').addEventListener('click', this.confirmReset.bind(this));
		this.$('btnClearWifi').addEventListener('click', this.confirmClearWifi.bind(this));
		this.$('btnSaveAddr').addEventListener('click', this.saveConfig.bind(this));
		this.$('cfgIp').addEventListener('keydown', function (ev) {
			if (ev.key === 'Enter')
				this.saveConfig();
		}.bind(this));
		this.$('btnSchedAdd').addEventListener('click', this.addSchedRule.bind(this));
		this.$('btnSchedSave').addEventListener('click', this.saveSchedule.bind(this));
		this.$('btnWdSave').addEventListener('click', this.saveWatchdog.bind(this));
	},

	validIp: function (s) {
		var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
		if (!m)
			return false;
		for (var i = 1; i <= 4; i++) {
			if (parseInt(m[i], 10) > 255)
				return false;
		}
		return true;
	},

	loadConfig: function () {
		var self = this;

		if (!self.root || !self.root.isConnected)
			return;

		callGetConfig().then(function (d) {
			if (d && d.ip && self.root.isConnected && !self.$('cfgIp').value)
				self.$('cfgIp').value = d.ip;
		}).catch(function () {});
	},

	saveConfig: function () {
		var self = this;
		var btn = self.$('btnSaveAddr');
		var ip = (self.$('cfgIp').value || '').trim();

		if (!self.validIp(ip)) {
			self.toast('请输入正确的 IP 地址，例如 192.168.58.246', false);
			self.$('cfgIp').focus();
			return;
		}

		btn.disabled = true;
		btn.textContent = '保存中...';

		callSetConfig(ip).then(function (d) {
			d = d || {};
			self.toast(d.msg || (d.ok ? '设备地址已保存' : '保存失败'), !!d.ok);
			if (d.ok) {
				self.$('cfgIp').value = ip;
				setTimeout(function () { self.refresh(); }, 300);
			}
		}).catch(function (e) {
			self.toast('保存失败：' + self.errText(e), false);
		}).then(function () {
			btn.disabled = false;
			btn.textContent = '保存';
		});
	},

	toast: function (msg, ok) {
		var t = this.$('toast');
		t.className = 'toast show ' + (ok ? 'ok' : 'err');
		t.textContent = msg;
		setTimeout(function () {
			if (t.isConnected)
				t.className = 'toast';
		}, 2800);
	},

	// -32002 Access denied 几乎都是"登录会话的权限快照过期"：
	// 升级插件后 rpcd 的 ACL 变了，但旧会话仍按旧权限列表鉴权。
	errText: function (e) {
		var m = (e && e.message) ? e.message : '';
		if (m.indexOf('-32002') !== -1 || m.indexOf('Access denied') !== -1)
			return '权限不足：插件升级后需要重新登录 LuCI（退出再登录，或重启路由器）后重试';
		return m || 'RPC 错误';
	},

	busy: function (show, txt) {
		this.$('busy').classList.toggle('show', show);
		if (txt)
			this.$('busyText').textContent = txt;
	},

	fmtUptime: function (s) {
		var d = Math.floor(s / 86400),
		    h = Math.floor((s % 86400) / 3600),
		    m = Math.floor((s % 3600) / 60),
		    sec = Math.floor(s % 60),
		    result = '';

		if (d) result += d + '天 ';
		if (h) result += h + '时 ';
		if (m) result += m + '分 ';
		result += sec + '秒';
		return result;
	},

	updatePcStatus: function (d) {
		if (d.pc_sleep) {
			this.$('stIcon').className = 'status-icon on';
			this.$('stIcon').textContent = '😴';
			this.$('stText').textContent = '😴 电脑睡眠中';
			this.$('stSub').textContent = 'POWER LED 正在闪烁，点击“开机”可以唤醒';
		} else if (d.pc_on) {
			this.$('stIcon').className = 'status-icon on';
			this.$('stIcon').textContent = '💡';
			this.$('stText').textContent = '✅ 电脑运行中';
			this.$('stSub').textContent = 'GPIO13 检测到 POWER LED 信号';
		} else {
			this.$('stIcon').className = 'status-icon off';
			this.$('stIcon').textContent = '⏻';
			this.$('stText').textContent = '🌙 电脑已关机';
			this.$('stSub').textContent = 'GPIO13 = LOW，未检测到 POWER LED';
		}
	},

	setUnreachable: function (msg) {
		if (!this.root.isConnected)
			return;
		this.$('connDot').className = 'dot err';
		this.$('connText').textContent = msg || '设备无响应';
	},

	refresh: function () {
		var self = this;

		if (!self.root || !self.root.isConnected) {
			if (pollTimer) {
				clearInterval(pollTimer);
				pollTimer = null;
			}
			return;
		}

		callStatus().then(function (d) {
			if (!self.root.isConnected)
				return;

			if (!d || d.ok === false || typeof d.pc_on === 'undefined') {
				self.setUnreachable(d ? d.msg : null);
				return;
			}

			self.state.pcOn = d.pc_on;
			self.state.pcSleep = d.pc_sleep;
			self.state.keyBusy = d.key_busy;
			self.state.gpio12 = d.gpio12;
			self.state.gpio13 = d.gpio13;
			self.state.lastFetch = Date.now();

			var online = (d.mode === 'STA_ONLINE') || (d.mode === 'AP');

			self.$('connDot').className = 'dot ' + (online ? '' : 'err');

			var modeText = {
				STA_ONLINE: 'WiFi 已连接',
				STA_CONNECTING: 'WiFi 连接中...',
				STA_FAILED: 'WiFi 连接失败',
				AP: 'AP 配网模式'
			};
			self.$('connText').textContent = modeText[d.mode] || d.mode;

			self.updatePcStatus(d);

			self.$('btnOn').disabled =
				self.state.keyBusy || (d.pc_on && !d.pc_sleep);
			self.$('btnOff').disabled =
				self.state.keyBusy || !d.pc_on || d.pc_sleep;
			self.$('btnForce').disabled = self.state.keyBusy;

			self.$('gpio12').textContent =
				d.gpio12 === 1 ? 'HIGH（按键按下）' : 'LOW（按键松开）';
			self.$('gpio13').textContent =
				d.gpio13 === 1 ? 'HIGH（POWER LED / 电脑开）'
				               : 'LOW（POWER LED / 电脑关）';
			self.$('keyState').textContent =
				d.key_busy ? 'PRESSING（执行中）' : 'IDLE（空闲）';
			self.$('pcStateDebug').textContent =
				d.pc_sleep ? 'SLEEP（睡眠）'
				           : (d.pc_on ? 'ON（开机）' : 'OFF（关机）');

			if (d.rssi) {
				var rssiText = d.rssi + ' dBm';
				if (d.rssi > -50)
					rssiText += '（极好）';
				else if (d.rssi > -65)
					rssiText += '（良好）';
				else if (d.rssi > -80)
					rssiText += '（一般）';
				else
					rssiText += '（较弱）';
				self.$('iRssi').textContent = rssiText;
			} else {
				self.$('iRssi').textContent = '—';
			}

			self.$('iIp').textContent = d.ip || '—';
			self.$('iHeap').textContent =
				(d.free_heap / 1024).toFixed(1) + ' KB';
			self.$('iUptime').textContent = self.fmtUptime(d.uptime_s || 0);
		}).catch(function () {
			self.setUnreachable();
		});
	},

	doCustomAction: function () {
		var ms = parseInt(this.$('cusMs').value, 10);
		if (isNaN(ms) || ms < 100 || ms > 15000) {
			this.toast('时长必须是100~15000毫秒', false);
			return;
		}
		this.doAction('custom', ms);
	},

	doAction: function (type, ms) {
		var self = this;

		if (self.state.keyBusy) {
			self.toast('POWER 按键正在执行，请稍后', false);
			return;
		}

		if (type === 'on' && self.state.pcOn === true && !self.state.pcSleep) {
			self.toast('电脑已经开机', false);
			return;
		}

		if (type === 'off' && (self.state.pcOn === false || self.state.pcSleep)) {
			self.toast(self.state.pcSleep ? '电脑正在睡眠，请先唤醒' : '电脑已经关机', false);
			return;
		}

		var actionName = {
			on: self.state.pcSleep ? '唤醒' : '开机',
			off: '正常关机',
			force: '强制关机',
			custom: '自定义'
		}[type] || '电源操作';

		var durationText = ms ? (ms + 'ms') : '0.5s';

		self.busy(true, '正在执行：' + actionName + ' ' + durationText);

		callPower(type, ms).then(function (d) {
			d = d || {};
			self.toast(d.msg || (d.ok ? '执行成功' : '执行失败'), !!d.ok);

			if (d.ok) {
				var hold;
				if (type === 'force')
					hold = 6500;
				else if (type === 'custom')
					hold = Number(ms) + 500;
				else
					hold = 1000;

				setTimeout(function () {
					self.busy(false);
					self.refresh();
				}, hold);

				setTimeout(function () { self.refresh(); }, 2000);
			} else {
				self.busy(false);
				self.refresh();
			}
		}).catch(function (e) {
			self.toast('请求失败：' + self.errText(e), false);
			self.busy(false);
			self.refresh();
		});
	},

	confirmReset: function () {
		var self = this;

		if (!window.confirm('确定重启电脑开机卡吗？\n\n约几秒后恢复。'))
			return;

		callReset().then(function (d) {
			d = d || {};
			self.toast(d.msg || '开机卡正在重启...', true);
		}).catch(function () {
			self.toast('设备已开始重启', true);
		});
	},

	confirmClearWifi: function () {
		var self = this;

		if (!window.confirm('确定清除 WiFi 配置吗？\n\n清除后设备会进入 AP 配网模式。'))
			return;

		callClearWifi().then(function (d) {
			d = d || {};
			self.toast(d.msg || 'WiFi 已清除，设备正在重启...', true);
		}).catch(function () {
			self.toast('设备正在重启并进入配网模式', true);
		});
	},

	/* ------------------------------------------------------------------ */
	/* 定时开关机                                                          */
	/* ------------------------------------------------------------------ */

	DAY_LABELS: ['日', '一', '二', '三', '四', '五', '六'],

	ACTION_LABELS: {
		on: '🔋 开机',
		off: '⛔ 关机',
		force: '⚠️ 强制关机'
	},

	// 后端同时接受 7 位掩码（位置 0=周日）与 cron 列表，这里统一为掩码。
	toWeekMask: function (v) {
		var mask = [0, 0, 0, 0, 0, 0, 0], i, tok, a, b;

		if (!v || v === '*')
			return '1111111';

		if (/^[01]{7}$/.test(v))
			return v;

		var parts = String(v).split(',');
		for (i = 0; i < parts.length; i++) {
			tok = parts[i];
			if (/^\d$/.test(tok)) {
				a = parseInt(tok, 10) % 7;
				mask[a] = 1;
			} else if (/^\d-\d$/.test(tok)) {
				a = parseInt(tok.charAt(0), 10) % 7;
				b = parseInt(tok.charAt(2), 10) % 7;
				if (a <= b) {
					for (; a <= b; a++)
						mask[a] = 1;
				} else {
					// 环绕范围，如 5-1（周五~周一）
					for (; a <= 6; a++)
						mask[a] = 1;
					for (a = 0; a <= b; a++)
						mask[a] = 1;
				}
			}
		}

		return mask.join('');
	},

	weekMaskText: function (mask) {
		if (mask === '1111111')
			return '每天';

		var i, sel = [];
		for (i = 0; i < 7; i++) {
			if (mask.charAt(i) === '1')
				sel.push(this.DAY_LABELS[i]);
		}

		if (sel.length === 0)
			return '未选择';

		// 常见组合的简写
		var s = sel.join('');
		if (s === '一二三四五') return '工作日';
		if (s === '日六') return '周末';

		return '周' + sel.join('、周');
	},

	loadSchedule: function () {
		var self = this;

		if (!self.root || !self.root.isConnected)
			return;

		callGetConfig().then(function (d) {
			if (!self.root.isConnected)
				return;

			var rules = (d && d.rules) || [];
			self.schedRules = rules.map(function (r) {
				return {
					enabled: r.enabled !== '0',
					time: r.time || '08:00',
					action: r.action || 'on',
					weekdays: self.toWeekMask(r.weekdays)
				};
			});

			// 预检开关：后端缺省视为开启，仅显式 '0' 才关闭
			var pre = self.$('schedPrecheck');
			if (pre)
				pre.checked = !(d && d.precheck === '0');

			self.renderSchedule();
		}).catch(function () {
			self.renderSchedule();
		});
	},

	renderSchedule: function () {
		var self = this;
		var list = self.$('schedList');
		var empty = self.$('schedEmpty');

		list.innerHTML = '';
		empty.style.display = self.schedRules.length ? 'none' : '';

		self.schedRules.forEach(function (rule, idx) {
			var item = E('div', { class: 'sched-item' + (rule.enabled ? '' : ' disabled') });

			var summary = E('div', { class: 'sched-summary' });

			var updSummary = function () {
				summary.textContent = (rule.enabled ? '' : '已停用 · ') +
					rule.time + ' · ' + self.weekMaskText(rule.weekdays) +
					' · ' + self.ACTION_LABELS[rule.action];
			};
			updSummary();

			var row = E('div', { class: 'sched-row' });

			var chk = E('input', { type: 'checkbox' });
			chk.checked = rule.enabled;
			chk.addEventListener('change', function () {
				rule.enabled = chk.checked;
				item.classList.toggle('disabled', !rule.enabled);
				updSummary();
			});

			var lbl = E('label', { class: 'sched-toggle' });
			lbl.appendChild(chk);
			lbl.appendChild(document.createTextNode('启用'));

			var timeInput = E('input', { type: 'time' });
			timeInput.value = rule.time;
			timeInput.addEventListener('change', function () {
				rule.time = timeInput.value || '08:00';
				updSummary();
			});

			var sel = E('select');
			['on', 'off', 'force'].forEach(function (act) {
				var opt = E('option', { value: act });
				opt.textContent = self.ACTION_LABELS[act];
				if (act === rule.action)
					opt.selected = true;
				sel.appendChild(opt);
			});
			sel.addEventListener('change', function () {
				rule.action = sel.value;
				updSummary();
			});

			var del = E('button', { class: 'sched-del', title: '删除' });
			del.textContent = '✕';
			del.addEventListener('click', function () {
				self.schedRules.splice(idx, 1);
				self.renderSchedule();
			});

			row.appendChild(lbl);
			row.appendChild(timeInput);
			row.appendChild(sel);
			row.appendChild(del);

			var days = E('div', { class: 'sched-days' });
			for (var d = 0; d < 7; d++) {
				(function (pos) {
					var btn = E('button', { type: 'button' });
					btn.textContent = self.DAY_LABELS[pos];
					if (rule.weekdays.charAt(pos) === '1')
						btn.classList.add('sel');
					btn.addEventListener('click', function () {
						var m = rule.weekdays.split('');
						m[pos] = m[pos] === '1' ? '0' : '1';
						rule.weekdays = m.join('');
						btn.classList.toggle('sel', m[pos] === '1');
						updSummary();
					});
					days.appendChild(btn);
				})(d);
			}

			item.appendChild(row);
			item.appendChild(days);
			item.appendChild(summary);
			list.appendChild(item);
		});
	},

	addSchedRule: function () {
		if (this.schedRules.length >= 32) {
			this.toast('最多支持 32 条定时规则', false);
			return;
		}

		this.schedRules.push({
			enabled: true,
			time: '08:00',
			action: 'on',
			weekdays: '1111111'
		});
		this.renderSchedule();
	},

	saveSchedule: function () {
		var self = this;
		var btn = self.$('btnSchedSave');

		// 本地校验：时间必须完整，且启用的规则至少选一天
		for (var i = 0; i < self.schedRules.length; i++) {
			var r = self.schedRules[i];

			if (!/^\d{2}:\d{2}$/.test(r.time || '')) {
				self.toast('第 ' + (i + 1) + ' 条规则的时间不完整', false);
				return;
			}
			if (r.enabled && r.weekdays.indexOf('1') === -1) {
				self.toast('第 ' + (i + 1) + ' 条规则至少要选择一个重复日', false);
				return;
			}
		}

		btn.disabled = true;
		btn.textContent = '保存中...';

		var rules = self.schedRules.map(function (r) {
			return {
				enabled: r.enabled ? '1' : '0',
				time: r.time,
				action: r.action,
				weekdays: r.weekdays
			};
		});

		var preEl = self.$('schedPrecheck');
		var precheck = (preEl && preEl.checked) ? '1' : '0';

		callSetScheduleConfig(rules, precheck).then(function (d) {
			d = d || {};
			self.toast(d.msg || (d.ok ? '定时规则已保存' : '保存失败'), !!d.ok);
		}).catch(function (e) {
			self.toast('保存失败：' + self.errText(e), false);
		}).then(function () {
			btn.disabled = false;
			btn.textContent = '💾 保存全部定时规则';
		});
	},

	/* ------------------------------------------------------------------ */
	/* 关机保护（强制断电兜底）                                            */
	/* ------------------------------------------------------------------ */

	fmtCountdown: function (sec) {
		sec = Math.max(0, Math.floor(sec));
		var m = Math.floor(sec / 60),
		    s = sec % 60;
		return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
	},

	updateWatchdogState: function (d) {
		var el = this.$('wdState');

		if (!el)
			return;

		if (d.armed && d.enabled === '1') {
			el.classList.add('show');
			el.textContent = '⏳ 已检测到软关机指令，剩余 ' +
				this.fmtCountdown(d.remaining) +
				' 后若电脑仍未关闭将自动强制断电';
		} else {
			el.classList.remove('show');
			el.textContent = '';
		}
	},

	loadWatchdog: function () {
		var self = this;

		if (!self.root || !self.root.isConnected)
			return;

		callGetConfig().then(function (d) {
			if (!d || !self.root.isConnected)
				return;

			var chk = self.$('wdEnabled'),
			    inp = self.$('wdMinutes');

			chk.checked = (d.enabled === '1');
			inp.value = d.minutes || '10';

			self.updateWatchdogState(d);

			// Poll while a timer is pending so the countdown ticks down.
			if (wdTimer) {
				clearInterval(wdTimer);
				wdTimer = null;
			}
			if (d.armed && d.enabled === '1') {
				wdTimer = setInterval(function () {
					if (!self.root || !self.root.isConnected) {
						clearInterval(wdTimer);
						wdTimer = null;
						return;
					}
					callGetConfig().then(function (d2) {
						if (!d2 || !self.root.isConnected)
							return;
						self.updateWatchdogState(d2);
						if (!d2.armed && wdTimer) {
							clearInterval(wdTimer);
							wdTimer = null;
						}
					}).catch(function () {});
				}, 10000);
			}
		}).catch(function () {});
	},

	saveWatchdog: function () {
		var self = this;
		var btn = self.$('btnWdSave');
		var enabled = self.$('wdEnabled').checked ? '1' : '0';
		var minutes = parseInt(self.$('wdMinutes').value, 10);

		if (isNaN(minutes) || minutes < 1 || minutes > 180) {
			self.toast('等待时间必须是 1~180 分钟', false);
			self.$('wdMinutes').focus();
			return;
		}

		btn.disabled = true;
		btn.textContent = '保存中...';

		callSetWatchdogConfig(enabled, minutes).then(function (d) {
			d = d || {};
			self.toast(d.msg || (d.ok ? '关机保护设置已保存' : '保存失败'), !!d.ok);
			if (d.ok)
				self.loadWatchdog();
		}).catch(function (e) {
			self.toast('保存失败：' + self.errText(e), false);
		}).then(function () {
			btn.disabled = false;
			btn.textContent = '💾 保存关机保护设置';
		});
	}
});
