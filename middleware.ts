// middleware.ts
import { withAuth } from '@kinde-oss/kinde-auth-nextjs/middleware'

export default withAuth()

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)'], // Ignore static files
}
