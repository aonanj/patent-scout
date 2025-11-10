export default function Head() {
  const canonical = "https://www.synapse-ip.com/help";
  const description =
    "Get answers to common SynapseIP questions, from AI/ML IP semantic search tips to managing automated alerts and IP overview analysis.";

  return (
    <>
      <title>Help Center | SynapseIP</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
    </>
  );
}
