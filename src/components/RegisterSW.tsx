"use client";

// Registreert de service worker (alleen in productie) voor offline gebruik.

import { useEffect } from "react";

export function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* stil falen: offline is een extra, geen blokker */
      });
    };
    // Als het load-event al geweest is (hydratie kan later komen), zou een
    // listener nooit meer vuren — registreer dan direct.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);
  return null;
}
