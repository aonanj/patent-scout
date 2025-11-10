export default function Head() {
  const canonical = "https://www.synapse-ip.com/docs";
  const description =
    "Review SynapseIP legal resources including Terms of Service, Privacy Policy, and Data Processing Agreement for AI patent intelligence customers.";

  return (
    <>
      <title>Legal Documentation | SynapseIP</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}

