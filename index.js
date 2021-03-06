import Discord from "discord.js"
import fs from "fs"

import GuildModules from "./GuildModules.js"
import Logger from "./Logger.js"

if (!fs.existsSync( `./guilds_modules/` )) fs.mkdirSync( `./guilds_modules/` )

export const LoggerClass = Logger

/** @typedef {import("./CommandProcessor.js").CommandErrorType} CommandErrorType */
/** @typedef {import("./CommandProcessor.js").CommandError} CommandError */

/** @typedef {import("./GuildModules.js").GuildModuleTranslation} GuildModuleTranslation */
/** @typedef {import("./GuildModules.js").GuildModuleFilters} GuildModuleFilters */
/** @typedef {import("./GuildModules.js").GuildModuleRoles} GuildModuleRoles */
/** @typedef {import("./GuildModules.js").GuildModuleCommandsField} GuildModuleCommandsField */
/** @typedef {import("./GuildModules.js").GuildModuleCommands} GuildModuleCommands */
/** @typedef {import("./GuildModules.js").GuildModule} GuildModule */
/** @typedef {import("./GuildModules.js").UnsafeVariables} GuildModule */

export default class CactuDiscordBot {
  discordClient = new Discord.Client()

  /** @type {Map<string,GuildModules>} */
  guildsData = new Map()

  moduleLogger = new Logger( [
    { align:'right',  color:'fgMagenta', length:30 }, // Guild name
    { align:'center', color:'bright',    length:6 },  // "  ::  "
    { align:'right',  color:'fgBlue',    length:10 }, // /(Filter|Command)/
    { length:3 },                                     // ":  "
    { align:'right',  color:'fgYellow',  length:15 }, // member displayName
    { length:3 },                                     // ":  "
    { splitLen:200, splitFLLen:150 },                 // /.*/
  ] )
  botLogger = new Logger( [
    { align:'right', color:'fgMagenta', length:5 },  // /Bot/
    { length:3 },                                    // /:  /
    { splitLen:90, splitFLLen:65 },                  // /.*/
  ] )

  prefix = `cc!`
  prefixSpace = true
  signs = { error:`❌`, warn:`⚠️`, ok:`✅` }

  /**
   * @typedef {Object} CactuDiscordBotConfig
   * @property {string} token
   * @property {string} [prefix]
   * @property {boolean} [prefixSpace]
   * @property {Object<string,*>} [publicVars]
   * @property {{ok:string,warn:string,error:string}} [signs]
   */
  /**
   * @param {CactuDiscordBotConfig} config
   */
  constructor( config ) {
    if (`prefix`      in config) this.prefix      = config.prefix
    if (`prefixSpace` in config) this.prefixSpace = config.prefixSpace
    if (`publicVars`  in config) this.publicVars  = config.publicVars
    if (`signs`       in config) this.signs       = config.signs

    this.discordClient
      .on( `message`, this.onMessage )
      .on( `ready`, this.onReady )
      .on( `messageUpdate`, this.onMessageUpdate )
      .login( config.token || `` )
      .catch( () => this.log( `I can't login in` ) )
  }

  loadModule = moduleName => {
    if (!moduleName) return

    const guilds = this.guildsData
    const id = moduleName.match( /(.*?)-(.*)/ )[ 1 ]

    import( `./guilds_modules/${moduleName}` )
      .then( module => guilds.get( id ).include( module.default ) )
      .catch( () => this.log( `I can't load module` ) )
  }

  clearGuildModules( guildIdToRemove, ...excludeNames ) {
    fs.readdirSync( `./guilds_modules` ).forEach( filename => {
      const [ guildId ] = filename.split( `-` )

      try {
        if (!excludeNames.includes( filename ) && guildId === guildIdToRemove) fs.unlinkSync( `./guilds_modules/${filename}` )
      } catch {
        this.log( `I can't remove module file (${filename})` )
      }
    } )

    this.guildsData.get( guildIdToRemove ).clear()
  }

  /**
   * @param {string} string
   */
  log( string ) {
    this.botLogger( `Bot`, `:`, string )
  }

  /**
   * @param {GuildModuleRoles} roleNames
   * @param {Discord.Snowflake} botOperatorId
   * @param {Discord.Message} param2
   */
  checkPermissions( roleNames, botOperatorId, { author, member, guild } ) {
    if (author.bot) return roleNames.includes( `@bot` )
    if (author.id === guild.ownerID || member.roles.has( botOperatorId )) return true

    for (const roleName of roleNames) {
      const roleObject = guild.roles.find( r => r.name === roleName )
      const havingARole = roleObject ? member.roles.has( roleObject.id ) : false

      if (havingARole) return true
    }
  }

  /**
   * @param {CommandError} param0
   * @param {GuildModuleTranslation} translation
   * @param {Discord.Message} param2
   */
  handleError({ type, value, paramMask }, translation, { author, channel }) {
    const { error } = this.signs
    let title = `Unknown error`
    let description = ``

    switch (type) {
      case `invalidCmd`:
        title = `${error} ${translation.err_invalidCmd}`

        if (typeof value === `string`) {
          title = `${error} ${translation.err_error}`
          description = `> \`${value}\` `
        } else description = `> \`${value.message}\` ` + value.stack.split( `\n` )[ 1 ]
          .split( /-/ )
          .slice( -1 )[ 0 ]
          .slice( 0, -1 )
        break

      case `badParam`:
        title = `${error} ${translation.err_badParam}`
        description = `> ${value}  \`${paramMask}\``
        break

      case `noCommand`: {
        const fields = []
        const scopes = []
        const cmds = []

        for (const part in value.structure) {
          const { type, desc, params } = value.structure[ part ]

          if (type == `scope`) {
            scopes.push( { name:`${part}...`, value:desc, inline:true } )
          } else {
            const paramsStrings = []

            for (const { param, rest, optional } of params) {
              paramsStrings.push( `${rest ? `...` : ``}${param}${optional ? `?` : ``}` )
            }

            const paramsString = paramsStrings.length
              ? `  \` ${paramsStrings.join( `   ` )} \``
              : ``

            cmds.push( {
              name: `${part}${paramsString}`,
              value: desc || `-  -  -`
            } )
          }
        }

        if (scopes.length) {
          description = `${translation.help_scopes}:`
          fields.push( ...scopes, { name:`\u200B`, value:`${translation.help_cmds}:` } )
        } else description = `${translation.help_cmds}:`

        fields.push( ...cmds )

        title = `⚙️ ${translation.help_title}`

        channel.send( { embed: { title, description, fields,
          color: 0x18d818,
          author: {
            name: `CodeCactu`,
            icon_url: this.discordClient.user.displayAvatarURL,
            url: `https://codecactu.github.io/`
          },
          footer: {
            text: `${translation.footer_yourCmds} ${value.command}`,
            icon_url: author.displayAvatarURL
          },
          timestamp: new Date(),
        } } )

        return
      }

      case `noParam`:
        title = `${error} ${translation.err_noParam}`
        description = `> ${value}  \`${paramMask}\``
        break

      case `noPath`:
        title = `${error} ${translation.err_noPath}`
        description = `> ${value}`
        break

      case `noPerms`:
        title = `${error} ${translation.err_noPerms}`
        description = `> ${value}`
        break

      case `noPrefix`:
        return
    }

    channel.send( { embed: { title, description,
      color: 0x18d818,
      footer: {
        text: translation.footer_cmdInfo,
        icon_url: author.displayAvatarURL
      },
      timestamp: new Date(),
    } } )
  }

  /**
   * @param {Discord.Message} message
   */
  getGuildData( message ) {
    const { guild, author } = message

    const id = guild
      ? guild.id
      : author
      ? author.client.guilds.find( ({ id }) => this.discordClient.guilds.has( id ) ).id
      : null

    if ((author.bot && author.id === this.discordClient.user.id) || !id) return

    return this.guildsData.get( id )
  }

  /**
   * @param {Discord.Message} message
   */
  onMessage = message => {
    const guildData = this.getGuildData( message )

    if (guildData) guildData.process( message, this )
  }

  /**
   * @param {Discord.Message} oldMessage
   * @param {Discord.Message} newMessage
   */
  onMessageUpdate = (oldMessage, newMessage) => {
    const guildData = this.getGuildData( newMessage )

    if (guildData) guildData.process( newMessage, this, { commands:false } )
  }

  onReady = () => {
    console.log()
    this.log( `I have been started` )
    console.log()

    this.discordClient.guilds.forEach( ({ id }) => this.guildsData.set( id, new GuildModules(
      this.prefix,
      this.prefixSpace,
      this.moduleLogger,
      (event, litener) => this.discordClient.on( event, litener ) )
    ) )

    fs.readdirSync( `./guilds_modules` ).forEach( this.loadModule )

    this.discordClient.user.setActivity( this.prefix, { type:`WATCHING` } )
  }
}