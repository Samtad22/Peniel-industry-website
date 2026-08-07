"use client";

import { useSyncExternalStore } from "react";

export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mq = window.matchMedia(query);
    if (mq.addEventListener) {
      mq.addEventListener("change", callback);
    } else {
      mq.addListener(callback);
    }
    return () => {
      if (mq.removeEventListener) {
        mq.removeEventListener("change", callback);
      } else {
        mq.removeListener(callback);
      }
    };
  };
  const getSnapshot = () => window.matchMedia(query).matches;
  const getServerSnapshot = () => false;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useScrolledPast(threshold = 12): boolean {
  const subscribe = (callback: () => void) => {
    window.addEventListener("scroll", callback, { passive: true });
    return () => window.removeEventListener("scroll", callback);
  };
  const getSnapshot = () => window.scrollY > threshold;
  const getServerSnapshot = () => false;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

export function useScrollY(): number {
  const subscribe = (callback: () => void) => {
    let raf: number | null = null;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        callback();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  };
  const getSnapshot = () => window.scrollY;
  const getServerSnapshot = () => 0;
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
