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

var pollTimer = null;

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

		var root = E('div', { id: 'pcapp', class: 'wrap' });
		root.innerHTML = MARKUP;
		this._wire(root);

		setTimeout(this.refresh.bind(this), 50);
		setTimeout(this.loadConfig.bind(this), 50);
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

		callSetConfig({ ip: ip }).then(function (d) {
			d = d || {};
			self.toast(d.msg || (d.ok ? '设备地址已保存' : '保存失败'), !!d.ok);
			if (d.ok) {
				self.$('cfgIp').value = ip;
				setTimeout(function () { self.refresh(); }, 300);
			}
		}).catch(function (e) {
			self.toast('保存失败：' + (e && e.message ? e.message : 'RPC 错误'), false);
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

		callPower({ type: type, ms: ms }).then(function (d) {
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
			self.toast('请求失败：' + (e && e.message ? e.message : 'RPC 错误'), false);
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
	}
});
