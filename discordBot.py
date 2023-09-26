import os
import pymongo
import discord
from discord.ext import commands
from interactions import SlashCommand, SlashContext, OptionType, ComponentContext
from interactions import create_option, SlashCommandChoice

intents = discord.Intents.default()
intents.typing = False
intents.presences = False

bot = commands.Bot(command_prefix="/", intents=intents)
slash = SlashCommand(bot, sync_commands=True, sync_on_cog_reload=True)
mongo_client = pymongo.MongoClient(os.environ["MONGODB_URI"])
db = mongo_client["your_database_name"]


@slash.slash(
    name="includeroles",
    description="Allow roles for the server.",
    options=[
        create_option(
            name="role_name",
            description="Name of the role to include.",
            option_type=OptionType.STRING,
            required=True,
        )
    ],
)
async def include_roles(ctx: SlashContext, role_name: str):
    # Check if the user is a moderator or administrator
    if "Moderator" in [role.name for role in ctx.author.roles] or "Administrator" in [
        role.name for role in ctx.author.roles
    ]:
        server_id = str(ctx.guild.id)
        collection = db[server_id]

        # Ensure that the server's roles are in the allowed_roles list by default
        allowed_roles = collection.find_one({}, {"allowed_roles": 1})
        if allowed_roles is None or "allowed_roles" not in allowed_roles:
            default_allowed_roles = [role.name for role in ctx.guild.roles]
            collection.update_one(
                {}, {"$set": {"allowed_roles": default_allowed_roles}}, upsert=True
            )

        # Remove the role from the disallowed_roles list if it exists
        collection.update_one(
            {}, {"$pull": {"disallowed_roles": role_name}}, upsert=True
        )
        await ctx.send(f"Role '{role_name}' is now allowed.")

    else:
        await ctx.send("You do not have permission to use this command.")


@slash.slash(
    name="disallowroles",
    description="Disallow roles for the server.",
    options=[
        create_option(
            name="role_name",
            description="Name of the role to disallow.",
            option_type=OptionType.STRING,
            required=True,
        )
    ],
)
async def disallow_roles(ctx: SlashContext, role_name: str):
    # Check if the user is a moderator or administrator
    if "Moderator" in [role.name for role in ctx.author.roles] or "Administrator" in [
        role.name for role in ctx.author.roles
    ]:
        server_id = str(ctx.guild.id)
        collection = db[server_id]

        # Ensure that the server's roles are in the allowed_roles list by default
        allowed_roles = collection.find_one({}, {"allowed_roles": 1})
        if allowed_roles is None or "allowed_roles" not in allowed_roles:
            default_allowed_roles = [role.name for role in ctx.guild.roles]
            collection.update_one(
                {}, {"$set": {"allowed_roles": default_allowed_roles}}, upsert=True
            )

        # Add the role to the disallowed_roles list
        collection.update_one(
            {}, {"$addToSet": {"disallowed_roles": role_name}}, upsert=True
        )
        await ctx.send(f"Role '{role_name}' is now disallowed.")

    else:
        await ctx.send("You do not have permission to use this command.")


@slash.slash(
    name="assignrole",
    description="Assign a role to a user.",
    options=[
        create_option(
            name="role_name",
            description="Name of the role to assign.",
            option_type=OptionType.STRING,
            required=True,
        )
    ],
)
async def assign_role(ctx: SlashContext, role_name: str):
    # Check if the role is in the disallowed_roles list
    server_id = str(ctx.guild.id)
    collection = db[server_id]
    disallowed_roles = collection.find_one({}, {"disallowed_roles": 1})

    if (
        disallowed_roles
        and "disallowed_roles" in disallowed_roles
        and role_name in disallowed_roles["disallowed_roles"]
    ):
        await ctx.send("You cannot assign this role.")
        return

    # Find the role by name
    role = None
    for r in ctx.guild.roles:
        if r.name == role_name:
            role = r
            break

    if role is None:
        await ctx.send(f"Role '{role_name}' not found.")
        return

    # Assign the role to the user who issued the command
    await ctx.author.add_roles(role)
    await ctx.send(f"Role '{role_name}' has been assigned to {ctx.author.mention}.")


@slash.slash(name="listroles", description="List available roles.")
async def list_roles(ctx: SlashContext):
    # Get all roles in the guild
    server_id = str(ctx.guild.id)
    collection = db[server_id]
    disallowed_roles = collection.find_one({}, {"disallowed_roles": 1})

    if disallowed_roles and "disallowed_roles" in disallowed_roles:
        roles = [
            r.name
            for r in ctx.guild.roles
            if r.name not in disallowed_roles["disallowed_roles"]
        ]
    else:
        roles = [r.name for r in ctx.guild.roles]

    if roles:
        await ctx.send("Available roles:\n" + "\n".join(roles))
    else:
        await ctx.send("No available roles.")


@bot.event
async def on_ready():
    print(f"Logged in as {bot.user.name} ({bot.user.id})")


bot.run(os.environ["BOT_TOKEN"])
