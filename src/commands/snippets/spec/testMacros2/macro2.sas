/**
  @file
  @brief Macro 2
  @details prints an arbitrary message to the log

  @param msg The message to be printed
  @param [in] indlm= ( ) Delimeter of the input string
  @param [out] outdlm= ( ) Delimiter of the output string
  @author Allan Bowe

**/

%macro example(msg);

  %let testvar=%sysfunc(ranuni(0));

  data work.example;
    msg=symget('msg');
    putlog msg=;
  run;

%mend example ;
