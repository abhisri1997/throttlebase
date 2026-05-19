import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'ThrottleBase API',
      version: '1.0.0',
      description:
        'REST API for the ThrottleBase biker community platform — rides, routes, profiles, and more.',
      contact: {
        name: 'ThrottleBase Team',
      },
    },
    servers: [
      {
        url: '/',
        description: 'Current server (auto-detected in production, localhost in development)',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token from /auth/login',
        },
        bearerAdminAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Admin JWT required (endpoint additionally enforces requireAdmin middleware)',
        },
      },
    },
    tags: [
      { name: 'Auth', description: 'Registration and login' },
      { name: 'Riders', description: 'Rider profile management' },
      { name: 'Rides', description: 'Ride creation, discovery, and participation' },
      { name: 'Routes', description: 'Route management, bookmarks, sharing, and GPS traces' },
      { name: 'Community', description: 'Posts, comments, likes, follows, groups, and ride reviews' },
      { name: 'Rewards', description: 'Badges, achievements, and leaderboard' },
      { name: 'Notifications', description: 'In-app notifications and preferences' },
      { name: 'Settings', description: 'App settings, privacy, and blocked riders' },
      { name: 'Security', description: 'Login activity, session management, and two-factor authentication' },
      { name: 'Support', description: 'Support ticket submission, rider replies, and admin management' },
      { name: 'Live Sessions', description: 'Live session health monitoring' },
    ],
  },
  apis: ['./src/routes/*.ts'],
};

let cachedSwaggerSpec: object | null = null;

export const getSwaggerSpec = () => {
  if (!cachedSwaggerSpec) {
    cachedSwaggerSpec = swaggerJsdoc(options);
  }

  return cachedSwaggerSpec;
};
