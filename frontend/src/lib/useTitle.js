import { useEffect } from "react";

export default function useTitle(suffix) {
  useEffect(() => {
    document.title = suffix ? `studioappgallery | ${suffix}` : "studioappgallery";
  }, [suffix]);
}
