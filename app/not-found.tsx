import Link from "next/link";
import { SimplePage } from "@/components/layout/SimplePage";

export default function NotFound() {
  return (
    <SimplePage title="This page isn't on the map">
      <p>
        The address may be mistyped. You can{" "}
        <Link href="/explore">return to the galaxy</Link> and find a planet from
        there.
      </p>
    </SimplePage>
  );
}
