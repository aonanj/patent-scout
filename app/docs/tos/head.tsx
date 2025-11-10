export default function Head() {
  const canonical = "https://synapse-ip.com/docs/tos";
  const description =
    "Understand the Terms of Service governing access to SynapseIP's AI/ML IP search, analytics, and alerting platform.";

  return (
    <>
      <title>Terms of Service | SynapseIP</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}

