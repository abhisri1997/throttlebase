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
        url: 'http://localhost:5001',
        description: 'Local development server',
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
    ],
  },
  apis: ['./src/routes/*.ts'],
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
