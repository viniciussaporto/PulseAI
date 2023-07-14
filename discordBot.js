const { Client, GatewayIntentBits, Partials, Permissions, EmbedBuilder } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');
const { MongoClient } = require('mongodb');
const fs = require('fs');

require('dotenv').config();

const token = process.env.TOKEN;
const clientId = process.env.CLIENT_ID;
const mongoConnectionString = process.env.MONGO_CONNECTION_STRING;

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent], partials: [Partials.Channel] });

// Error log file stream
const errorLogStream = fs.createWriteStream('error.log', { flags: 'a' });

async function registerGuildSlashCommands(guildId) {
  try {
    console.log(`Started refreshing guild (${guildId}) commands.`);

    const commands = [
      {
        name: 'role',
        description: 'Manage self-assignable roles',
        options: [
          {
            name: 'list',
            description: 'List available roles',
            type: 1,
          },
          {
            name: 'add',
            description: 'Add a role to yourself',
            type: 1, // Subcommand type
            options: [
              {
                name: 'role',
                description: 'The role to add',
                type: 8, // Role type
                required: true,
              },
            ],
          },
          {
            name: 'remove',
            description: 'Remove a role from yourself',
            type: 1,
            options: [
              {
                name: 'role',
                description: 'The role to remove',
                type: 8,
                required: true,
              },
            ],
          },
        ],
      },
      {
        name: 'config',
        description: 'Configure self-assignable roles',
        options: [
          {
            name: 'add',
            description: 'Add a role as self-assignable',
            type: 1,
            options: [
              {
                name: 'role',
                description: 'The role to add',
                type: 8,
                required: true,
              },
            ],
          },
          {
            name: 'remove',
            description: 'Remove a role from self-assignable',
            type: 1,
            options: [
              {
                name: 'role',
                description: 'The role to remove',
                type: 8,
                required: true,
              },
            ],
          },
        ],
      },
    ];

    const rest = new REST({ version: '9' }).setToken(token);

    await rest.put(
      Routes.applicationGuildCommands(clientId, guildId),
      { body: commands }
    );

    console.log(`Successfully registered guild (${guildId}) commands.`);

    // Fetch the roles data for the specific guild from MongoDB Atlas
    const rolesData = await getRolesData(guildId);

    // Process the roles data and update your bot logic accordingly
    const availableroles = rolesData.availableroles;
    const removedroles = rolesData.removedroles;

    // Update your bot logic with the fetched data
    // For example, you can filter out the removed roles from the available roles list

  } catch (error) {
    console.error(`Error registering guild (${guildId}) commands:`, error);
    errorLogStream.write(`Error registering guild (${guildId}) commands: ${error}\n`);
  }
}

function chunkArray(array, chunkSize) {
  const chunks = [];
  let index = 0;

  while (index < array.length) {
    chunks.push(array.slice(index, index + chunkSize));
    index += chunkSize;
  }

  return chunks;
}

async function createGuildCollection(guildId) {
  const client = new MongoClient(mongoConnectionString, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');

    const database = client.db('Cluster0'); // Use the default database from the connection string
    const collection = database.collection(guildId); // Use the guildId as the collection name

    const collectionExists = await collection.countDocuments() > 0;

    if (!collectionExists) {
      const initialData = { guildId: guildId, availableroles: [], removedroles: [] };
      await collection.insertOne(initialData);
      console.log(`Created collection for guild ${guildId}`);
    } else {
      console.log(`Collection for guild ${guildId} already exists`);
    }
  } catch (error) {
    console.error('Error connecting to MongoDB Atlas:', error);
    errorLogStream.write(`Error connecting to MongoDB Atlas: ${error}\n`);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB Atlas');
  }
}

async function getRolesData(guildId) {
  const client = new MongoClient(mongoConnectionString, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');

    const database = client.db('Cluster0');
    const collection = database.collection('guilds');

    // Find the document for the specific guild
    const document = await collection.findOne({ guildId: guildId });

    if (document) {
      return document.rolesData;
    } else {
      return { guildId: guildId, availableroles: [], removedroles: [] };
    }
  } catch (error) {
    console.error('Error connecting to MongoDB Atlas:', error);
    errorLogStream.write(`Error connecting to MongoDB Atlas: ${error}\n`);
    return { guildId: guildId, availableroles: [], removedroles: [] };
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB Atlas');
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  const { commandName, options, member, guild } = interaction;

  // Handle the 'role' command
  if (commandName === 'role') {
    const subcommand = options.getSubcommand();

    if (subcommand === 'list') {
      const roles = guild.roles.cache
        .filter((role) => !role.managed && !role.name.startsWith('@'))
        .sort((a, b) => a.name.localeCompare(b.name));

      if (roles.size) {
        const roleChunks = chunkArray([...roles.values()], 3); // Split roles into chunks of 3 for columns

        const embed = new EmbedBuilder().setTitle('Available Roles');

        roleChunks.forEach((roleChunk) => {
          const columnContent = roleChunk.map((role) => role.name).join('\n'); // Join role names with line breaks for each column

          embed.addFields({ name: '\u200B', value: columnContent, inline: true }); // Add field with column content
        });

        await interaction.reply({ embeds: [embed] });
      } else {
        await interaction.reply('No roles available.');
      }
    } else if (subcommand === 'add' && member) {
      const role = options.getRole('role');

      if (!role) {
        await interaction.reply('Please specify a valid role to add.');
        return;
      }

      if (!member.roles.cache.has(role.id)) {
        try {
          await member.roles.add(role);
          await interaction.reply(`Role ${role.name} has been added to you.`);
        } catch (error) {
          console.error(`Failed to add role: ${error}`);
          await interaction.reply('Failed to add the role.');
        }
      } else {
        await interaction.reply('You already have that role.');
      }
    } else if (subcommand === 'remove' && member) {
      const role = options.getRole('role');

      if (!role) {
        await interaction.reply('Please specify a valid role to remove.');
        return;
      }

      if (member.roles.cache.has(role.id)) {
        try {
          await member.roles.remove(role);
          await interaction.reply(`Role ${role.name} has been removed from you.`);
        } catch (error) {
          console.error(`Failed to remove role: ${error}`);
          await interaction.reply('Failed to remove the role.');
        }
      } else {
        await interaction.reply("You don't have that role.");
      }
    }
  }

  // Handle the 'config' command
  if (commandName === 'config') {
    console.log('Command: config');
    console.log('Member:', member);

    if (!member) {
      await interaction.reply('This command is restricted to members only.');
      return;
    }

    if (member.permissions.has('ADMINISTRATOR')) {
      console.log('Member has ADMINISTRATOR permission.');

      const subcommand = options.getSubcommand();

      if (subcommand === 'add') {
        const role = options.getRole('role');

        if (!role) {
          await interaction.reply('Please specify a valid role to add.');
          return;
        }

        // Code to add a role as self-assignable
        const rolesData = await getRolesData(guild.id);
        const { availableroles, removedroles } = rolesData;

        if (!availableroles.includes(role.id)) {
          availableroles.push(role.id);
          await updateRolesData(guild.id, availableroles, removedroles);
          await interaction.reply(`Role ${role.name} has been added to the available roles.`);
        } else {
          await interaction.reply('The role is already available.');
        }
      } else if (subcommand === 'remove') {
        const role = options.getRole('role');

        if (!role) {
          await interaction.reply('Please specify a valid role to remove.');
          return;
        }

        // Code to remove a role from self-assignable
        const rolesData = await getRolesData(guild.id);
        const { availableroles, removedroles } = rolesData;

        if (availableroles.includes(role.id)) {
          // Remove the role from the availableroles array
          const updatedavailableroles = availableroles.filter((r) => r !== role.id);
          
          // Update the roles data in the database
          await updateRolesData(guildId, updatedavailableroles, removedroles);
        
          await interaction.reply(`Role ${role.name} has been removed from the available roles.`);
        } else {
          await interaction.reply('The role is not available.');
        }
      } else {
        await interaction.reply('You do not have permission to use this command.');
      }
    }
  }
});

async function updateRolesData(guildId, availableroles, removedroles) {
  const client = new MongoClient(mongoConnectionString, { useNewUrlParser: true, useUnifiedTopology: true });

  try {
    await client.connect();
    console.log('Connected to MongoDB Atlas');

    const database = client.db('Cluster0');
    const collection = database.collection('guilds');

    // Update the document for the specific guild
    await collection.updateOne(
      { guildId: guildId },
      { $set: { rolesData: { availableroles, removedroles } } },
      { upsert: true }
    );

    console.log('Roles data updated successfully');
  } catch (error) {
    console.error('Error connecting to MongoDB Atlas:', error);
    errorLogStream.write(`Error connecting to MongoDB Atlas: ${error}\n`);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB Atlas');
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);

  client.guilds.cache.forEach((guild) => {
    registerGuildSlashCommands(guild.id);
    createGuildCollection(guild.id); // Create guild collection if it doesn't exist
  });
});

client.login(token);