import StatePanel from "@/components/ui/StatePanel";

export default function PortalNotFound() {
  return (
    <StatePanel code="Not found" title="We couldn't find that" action={{ href: "/ops", label: "Back to Peniel Ops" }}>
      It may have been removed, or the link is wrong. If someone sent you this link, ask them to check it.
    </StatePanel>
  );
}
