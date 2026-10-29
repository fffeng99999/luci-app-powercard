# SPDX-License-Identifier: MIT
#
# Copyright (c) 2026
#
# LuCI application for the ESP8266 PC PowerCard.
# Embeds the card's control panel into OpenWrt LuCI; the rpcd shell
# backend proxies the HTTP API of the ESP8266 firmware (same-origin).

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-powercard
PKG_VERSION:=1.3.4
PKG_RELEASE:=1

LUCI_TITLE:=LuCI panel for ESP8266 PC PowerCard
# Busybox already ships crond plus /etc/init.d/cron, which the schedule
# feature relies on; no extra cron package dependency is needed.
LUCI_DEPENDS:=+luci-base +rpcd +curl +uclient-fetch +jsonfilter
LUCI_PKGARCH:=all

define Package/$(PKG_NAME)/conffiles
/etc/config/powercard
endef

include $(TOPDIR)/feeds/luci/luci.mk

# Re-assert the executable bit of the rpcd plugin: checkouts on
# case-insensitive file systems (Windows/macOS) may lose it.
define Package/$(PKG_NAME)/install
	$(call Package/luci/install/target,$(1),$(PKG_INSTALL_DIR))
	chmod 0755 $(1)/usr/libexec/rpcd/powercard
endef

# On install/upgrade, (re)install the powercard cron lines so the
# per-minute shutdown-watchdog tick is present without a manual save.
define Package/$(PKG_NAME)/postinst
#!/bin/sh
[ -n "$${IPKG_INSTROOT}" ] && exit 0
/usr/libexec/rpcd/powercard ensure_cron >/dev/null 2>&1
# rpcd loads /usr/share/rpcd/acl.d only at startup: without a restart the
# newly granted ubus methods stay "Access denied" (-32002) for every
# session. Restarting also drops stale login sessions so LuCI re-reads
# the permissions on the next login.
/etc/init.d/rpcd restart >/dev/null 2>&1
exit 0
endef

# call BuildPackage - OpenWrt buildroot signature
