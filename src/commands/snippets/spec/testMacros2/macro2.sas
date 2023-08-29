/**
  @file
  @BRIEF Macro 2 with uppercase @BRIEF
  @details prints an arbitrary message to the log

  @param msg The message to be printed
  @PARAM [in] indlm= ( ) Uppercase @PARAM
  @param [OUT] outdlm= ( ) Uppercase [OUT]
  @param[out] outdlm= ( ) No space after @param
  @param [out]outdlm= ( ) No space after [out]
  @param [out]outdlm= ( ) No space after @param and [out]
  @param [in,out] scopeds= () with [in,out]
  @param [anything] anything= () with [anything]
  @author Allan Bowe

**/

%macro example(msg);

  %let testvar=%sysfunc(ranuni(0));

  data work.example;
    msg=symget('msg');
    putlog msg=;
  run;

%mend example ;
