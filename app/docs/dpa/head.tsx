export default function Head() {
  const canonical = "https://patent-scout.com/docs/dpa";
  const description =
    "Review SynapseIP's Data Processing Agreement outlining GDPR and CCPA commitments for enterprise patent intelligence customers.";

  return (
    <>
      <title>Data Processing Agreement | SynapseIP</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}

