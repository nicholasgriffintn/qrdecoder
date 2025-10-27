export default {
  async fetch(request, env, ctx): Promise<Response> {
    const url = new URL(request.url);

    switch (url.pathname) {
      case '/status':
        return new Response('OK');
      default:
        return new Response('Not Found', { status: 404 });
    }
  },
} satisfies ExportedHandler<Env>;
