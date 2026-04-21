"use client";

import { useEffect, useState } from "react";
import { apiUrl } from "@/lib/utils";

interface Implementation {
  _id: string;
  title: string;
  description: string;
  status: string;
  createdAt: string;
}

export default function Implementations() {
  const [implementations, setImplementations] = useState<Implementation[]>([]);

  useEffect(() => {
    fetch(apiUrl("/api/implementations"))
      .then((res) => res.json())
      .then((data) => setImplementations(data));
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold mb-4">
        Implementaciones en Producción
      </h1>
      <ul>
        {implementations.map((impl) => (
          <li key={impl._id} className="mb-2">
            <h2 className="text-xl">{impl.title}</h2>
            <p>{impl.description}</p>
            <p>Status: {impl.status}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
