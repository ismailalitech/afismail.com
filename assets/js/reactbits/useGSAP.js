/* A small stand-in for the useGSAP hook of @gsap/react, which the React Bits SplitText
   component uses. It runs the callback inside a gsap.context, so everything the callback
   creates (tweens, ScrollTriggers, splits) is cleaned up when the component updates or leaves.
   Only what SplitText needs is supported: dependencies, scope and revertOnUpdate. */
import { useEffect, useLayoutEffect, useRef } from 'react';
import { gsap } from 'gsap';

const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

export function useGSAP(callback, config) {
  const options = config || {};
  const dependencies = options.dependencies || [];
  const scope = options.scope;
  const contextRef = useRef(null);
  useIsoLayoutEffect(() => {
    const target = scope && scope.current ? scope.current : undefined;
    const context = gsap.context(callback, target);
    contextRef.current = context;
    return () => context.revert();
  }, dependencies);
  return { context: contextRef.current };
}
