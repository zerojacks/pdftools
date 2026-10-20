import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Demo Login",
      credentials: {
        username: { label: "Username", type: "text", placeholder: "demo" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        if (credentials?.username === "demo" && credentials?.password === "demo") {
          return { id: "1", name: "Demo User", email: "demo@example.com" };
        }
        return null;
      }
    })
  ],
  session: {
    strategy: "jwt",
  },
  theme: {
    colorScheme: "light",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
