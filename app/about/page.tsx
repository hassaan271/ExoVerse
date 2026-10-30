import type { Metadata } from "next";
import { SimplePage } from "@/components/layout/SimplePage";

export const metadata: Metadata = { title: "About | ExoVerse" };

export default function AboutPage() {
  return (
    <SimplePage title="About ExoVerse">
      <p>
        ExoVerse is a 3D exploration platform for planets beyond our solar
        system. It turns NASA&rsquo;s scientific exoplanet data into something
        you can move through, read and question.
      </p>
      <p>
        Every planet comes from the{" "}
        <a href="https://exoplanetarchive.ipac.caltech.edu/">
          NASA Exoplanet Archive
        </a>
        . Where a value is missing, ExoVerse says so instead of estimating it.
        Planet images are artistic visualizations generated from each planet&rsquo;s
        name and known values, not photographs.
      </p>
    </SimplePage>
  );
}
