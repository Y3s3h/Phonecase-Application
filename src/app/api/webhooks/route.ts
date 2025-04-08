// import { db } from '@/db'
// import { stripe } from '@/lib/stripe'
// import { headers } from 'next/headers'
// import { NextResponse } from 'next/server'
// import Stripe from 'stripe'
// import { Resend } from 'resend'
// import OrderReceivedEmail from '@/components/emails/OrderReceivedEmail'

// const resend = new Resend(process.env.RESEND_API_KEY)

// export async function POST(req: Request) {
//   try {
//     const body = await req.text()
//     const signature = headers().get('stripe-signature')

//     if (!signature) {
//       return new Response('Invalid signature', { status: 400 })
//     }

//     const event = stripe.webhooks.constructEvent(
//       body,
//       signature,
//       process.env.STRIPE_WEBHOOK_SECRET!
//     )

//     if (event.type === 'checkout.session.completed') {
//       if (!event.data.object.customer_details?.email) {
//         throw new Error('Missing user email')
//       }

//       const session = event.data.object as Stripe.Checkout.Session

//       const { userId, orderId } = session.metadata || {
//         userId: null,
//         orderId: null,
//       }

//       if (!userId || !orderId) {
//         throw new Error('Invalid request metadata')
//       }

//       const billingAddress = session.customer_details!.address
//       const shippingAddress = session.shipping_details!.address

//       const updatedOrder = await db.order.update({
//         where: {
//           id: orderId,
//         },
//         data: {
//           isPaid: true,
//           shippingAddress: {
//             create: {
//               name: session.customer_details!.name!,
//               city: shippingAddress!.city!,
//               country: shippingAddress!.country!,
//               postalCode: shippingAddress!.postal_code!,
//               street: shippingAddress!.line1!,
//               state: shippingAddress!.state,
//             },
//           },
//           billingAddress: {
//             create: {
//               name: session.customer_details!.name!,
//               city: billingAddress!.city!,
//               country: billingAddress!.country!,
//               postalCode: billingAddress!.postal_code!,
//               street: billingAddress!.line1!,
//               state: billingAddress!.state,
//             },
//           },
//         },
//       })

//       await resend.emails.send({
//         from: 'onboarding@resend.dev',
//         to: [event.data.object.customer_details.email],
//         subject: 'Thanks for your order!',
//         react: OrderReceivedEmail({
//           orderId,
//           orderDate: updatedOrder.createdAt.toLocaleDateString(),
//           // @ts-ignore
//           shippingAddress: {
//             name: session.customer_details!.name!,
//             city: shippingAddress!.city!,
//             country: shippingAddress!.country!,
//             postalCode: shippingAddress!.postal_code!,
//             street: shippingAddress!.line1!,
//             state: shippingAddress!.state,
//           },
//         }),
//       })
//     }

//     return NextResponse.json({ result: event, ok: true })
//   } catch (err) {
//     console.error(err)

//     return NextResponse.json(
//       { message: 'Something went wrong', ok: false },
//       { status: 500 }
//     )
//   }
// }

import { db } from '@/db'
import { stripe } from '@/lib/stripe'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { Resend } from 'resend'
import OrderReceivedEmail from '@/components/emails/OrderReceivedEmail'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: Request) {
  try {
    const body = await req.text()
    const signature = headers().get('stripe-signature')

    if (!signature) {
      return new Response('Missing Stripe signature', { status: 400 })
    }

    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )

    console.log("✅ Stripe event received:", event.type)

    if (event.type !== 'checkout.session.completed') {
      return NextResponse.json({ message: 'Unhandled event type', ok: true })
    }

    const session = event.data.object as Stripe.Checkout.Session
    const email = session.customer_details?.email
    const name = session.customer_details?.name
    const billing = session.customer_details?.address
    const shipping = session.shipping_details?.address
    const metadata = session.metadata

    if (!email || !name || !billing || !shipping || !metadata?.orderId || !metadata?.userId) {
      throw new Error('Missing required session details')
    }

    // ✅ Update Order
    const updatedOrder = await db.order.update({
      where: { id: metadata.orderId },
      data: {
        isPaid: true,
        shippingAddress: {
          create: {
            name,
            city: shipping.city!,
            country: shipping.country!,
            postalCode: shipping.postal_code!,
            street: shipping.line1!,
            state: shipping.state,
          },
        },
        billingAddress: {
          create: {
            name,
            city: billing.city!,
            country: billing.country!,
            postalCode: billing.postal_code!,
            street: billing.line1!,
            state: billing.state,
          },
        },
      },
    })

    // ✅ Send Resend Email
    try {
      const result = await resend.emails.send({
        from: 'onboarding@resend.dev',
        to: [email],
        subject: 'Thanks for your order!',
        react: OrderReceivedEmail({
          orderId: metadata.orderId,
          orderDate: updatedOrder.createdAt.toLocaleDateString(),
          shippingAddress: {
            name,
            city: shipping.city!,
            country: shipping.country!,
            postalCode: shipping.postal_code!,
            street: shipping.line1!,
            state: shipping.state,
          },
        }),
      })

      console.log("📧 Email sent via Resend:", result)
    } catch (emailErr) {
      console.error("❌ Resend email failed:", emailErr)
    }

    return NextResponse.json({ ok: true, result: event })
  } catch (err) {
    console.error("❌ Webhook error:", err)
    return NextResponse.json({ ok: false, message: 'Internal error' }, { status: 500 })
  }
}
