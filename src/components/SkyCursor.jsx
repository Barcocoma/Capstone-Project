import { useEffect, useRef, useState } from "react";
import "./SkyCursor.css";

const INTERACTIVE_SELECTORS =
  'a, button, [role="button"], [data-cursor="interactive"], .cursor-interactive';

export function SkyCursor() {
  const innerRef = useRef(null);
  const outerRef = useRef(null);
  const rafId = useRef(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const prefersCoarse = window.matchMedia("(pointer: coarse)").matches;
    const prefersFine = window.matchMedia("(pointer: fine)").matches;
    if (!prefersFine || prefersCoarse) return;

    const inner = innerRef.current;
    const outer = outerRef.current;
    if (!inner || !outer) return;

    setEnabled(true);
    document.body.classList.add("custom-sky-cursor-active");

    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    let outerX = mouseX;
    let outerY = mouseY;
    const followSpeed = 0.12;

    const handleMove = (event) => {
      mouseX = event.clientX;
      mouseY = event.clientY;
      inner.style.left = `${mouseX}px`;
      inner.style.top = `${mouseY}px`;
    };

    const animate = () => {
      outerX += (mouseX - outerX) * followSpeed;
      outerY += (mouseY - outerY) * followSpeed;
      outer.style.left = `${outerX}px`;
      outer.style.top = `${outerY}px`;
      rafId.current = requestAnimationFrame(animate);
    };
    animate();

    window.addEventListener("mousemove", handleMove);

    const applyHover = () => {
      inner.classList.add("sky-cursor--hover");
      outer.classList.add("sky-cursor--hover");
    };

    const removeHover = () => {
      inner.classList.remove("sky-cursor--hover");
      outer.classList.remove("sky-cursor--hover");
    };

    const registerInteractive = () => {
      const nodes = Array.from(
        document.querySelectorAll(INTERACTIVE_SELECTORS)
      );
      nodes.forEach((node) => {
        node.addEventListener("mouseenter", applyHover);
        node.addEventListener("mouseleave", removeHover);
      });
      return nodes;
    };

    let trackedNodes = registerInteractive();

    const observer = new MutationObserver(() => {
      trackedNodes.forEach((node) => {
        node.removeEventListener("mouseenter", applyHover);
        node.removeEventListener("mouseleave", removeHover);
      });
      trackedNodes = registerInteractive();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    const hide = () => {
      inner.classList.add("sky-cursor--hidden");
      outer.classList.add("sky-cursor--hidden");
    };

    const show = () => {
      inner.classList.remove("sky-cursor--hidden");
      outer.classList.remove("sky-cursor--hidden");
    };

    window.addEventListener("mouseleave", hide);
    window.addEventListener("mouseenter", show);
    window.addEventListener("scroll", show);

    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseleave", hide);
      window.removeEventListener("mouseenter", show);
      window.removeEventListener("scroll", show);
      observer.disconnect();
      trackedNodes.forEach((node) => {
        node.removeEventListener("mouseenter", applyHover);
        node.removeEventListener("mouseleave", removeHover);
      });
      document.body.classList.remove("custom-sky-cursor-active");
    };
  }, []);

  if (!enabled) return null;

  return (
    <>
      <div ref={outerRef} className="sky-cursor sky-cursor--outer" />
      <div ref={innerRef} className="sky-cursor sky-cursor--inner" />
    </>
  );
}

export default SkyCursor;


