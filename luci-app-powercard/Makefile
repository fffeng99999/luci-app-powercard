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
PKG_RELEASE:=1

LUCI_TITLE:=LuCI panel for ESP8266 PC PowerCard
LUCI_DEPENDS:=+luci-base +rpcd +uclient-fetch +jsonfilter
LUCI_PKGARCH:=all

# Make sure the rpcd plugin keeps its executable bit regardless of the
# source file system the package was copied from.
define Hooks/Prepare/Post
	chmod 0755 $(PKG_BUILD_DIR)/root/usr/libexec/rpcd/powercard
endef

define Package/$(PKG_NAME)/conffiles
/etc/config/powercard
endef

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
