export default function Head() {
  const canonical = "https://synapse-ip.com/docs/privacy";
  const description =
    "Learn how SynapseIP collects, processes, and safeguards personal data for AI/ML IP intelligence subscribers in the Privacy Policy.";

  return (
    <>
      <title>Privacy Policy | SynapseIP</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}

