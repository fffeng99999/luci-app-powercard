# SPDX-License-Identifier: MIT
#
# Copyright (c) 2026
#
# LuCI application for the ESP8266 PC PowerCard.
# Embeds the card's control panel into OpenWrt LuCI; the rpcd shell
# backend proxies the HTTP API of the ESP8266 firmware (same-origin).

include $(TOPDIR)/rules.mk

PKG_NAME:=luci-app-powercard
PKG_VERSION:=1.0.0
PKG_RELEASE:=2

LUCI_TITLE:=LuCI panel for ESP8266 PC PowerCard
LUCI_DEPENDS:=+luci-base +rpcd +uclient-fetch +jsonfilter
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

# call BuildPackage - OpenWrt buildroot signature
