const path = require('path')

if (!_requestMethod) {
  defaultMethod()
  return
}

switch(_requestMethod) {
  case 'POST': {
    postMethod()
    break
  }
  case 'GET': {
    getMethod()
    break
  }
  default:
    defaultMethod()
    break
}

function postMethod() {
  const fileData = _WEBIN_FILEREF1.toString()
  const regex = /let compiled_apploc.*?;/gm
  const matched = fileData.match(regex)

  if (matched && fileData.includes('createwebservice')) {
    const appLocString = matched[0]
    let appLocValue = appLocString.split('=')[1].replace(';', '')
    const dirPath = path.join(_driveLoc, 'files', appLocValue)
    fs.mkdirSync(dirPath, { recursive: true })
    const runRequestPath = path.join(dirPath, 'services', 'runRequest')
    fs.mkdirSync(runRequestPath, { recursive: true })
    
    const err = `_webout='Service error occured.'`
    const sendArr = `_webout=''>>weboutBEGIN<< {"SYSDATE" : "16SEP22" ,"SYSTIME" : "10:58" , "table1": [ [ "first col value1", "second col value1" ], [ "first col value2", "second col value2" ] ] , "table2": [ [ "first col value" ] ] ,"_DEBUG" : "131" ,"_METAUSER": "sasdemo@sasdemo" ,"_METAPERSON": "sasdemo" ,"_PROGRAM" : "/User Folders/sasdemo/My Folder/cli-tests/cli-tests-request-sas9-20220916145819/services/runRequest/sendArr" ,"AUTOEXEC" : "D%3A%5Copt%5Csasinside%5CConfig%5CLev1%5CSASApp%5CStoredProcessServer%5Cautoexec.sas" ,"MF_GETUSER" : "sasdemo" ,"SYSCC" : "0" ,"SYSENCODING" : "wlatin1" ,"SYSERRORTEXT" : "" ,"SYSHOSTNAME" : "sasdemo" ,"SYSPROCESSID" : "0000000000" ,"SYSPROCESSMODE" : "SAS Stored Process Server" ,"SYSPROCESSNAME" : "" ,"SYSJOBID" : "12345" ,"SYSSCPL" : "X64_DSRV16" ,"SYSSITE" : "123" ,"SYSUSERID" : "sassrv" ,"SYSVLONG" : "9.04.0" ,"SYSWARNINGTEXT" : "ENCODING" ,"END_DTTM" : "2022-09-16T10:58:35.487000" ,"MEMSIZE" : "47GB" }>>weboutEND<<''`
    const sendObj = `_webout='>>weboutBEGIN<< {"SYSDATE" : "16SEP22" ,"SYSTIME" : "10:58" , "table1": [ { "COL1": "first col value1", "COL2": "second col value1" }, { "COL1": "first col value2", "COL2": "second col value2" } ] , "table2": [ { "COL1": "first col value" } ] ,"_DEBUG" : "131" ,"_METAUSER": "sasdemo@sasdemo" ,"_METAPERSON": "sasdemo" ,"_PROGRAM" : "/User Folders/sasdemo/My Folder/cli-tests/cli-tests-request-sas9-20220916145819/services/runRequest/sendObj" ,"AUTOEXEC" : "D%3A%5Copt%5Csasinside%5CConfig%5CLev1%5CSASApp%5CStoredProcessServer%5Cautoexec.sas" ,"MF_GETUSER" : "sasdemo" ,"SYSCC" : "0" ,"SYSENCODING" : "wlatin1" ,"SYSERRORTEXT" : "" ,"SYSHOSTNAME" : "sasdemo" ,"SYSPROCESSID" : "0000000000" ,"SYSPROCESSMODE" : "SAS Stored Process Server" ,"SYSPROCESSNAME" : "" ,"SYSJOBID" : "12345" ,"SYSSCPL" : "X64_DSRV16" ,"SYSSITE" : "123" ,"SYSUSERID" : "sassrv" ,"SYSVLONG" : "9.04.0" ,"SYSWARNINGTEXT" : "ENCODING" ,"END_DTTM" : "2022-09-16T10:58:36.721000" ,"MEMSIZE" : "47GB" }>>weboutEND<<'`

    fs.writeFileSync(path.join(runRequestPath, 'err.js'), err)
    fs.writeFileSync(path.join(runRequestPath, 'sendArr.js'), sendArr)
    fs.writeFileSync(path.join(runRequestPath, 'sendObj.js'), sendObj)
  }

  _webout = 'Runner POST'

  if (fileData.includes('run;')) _webout += ' \n' + fileData
}

function getMethod() {
  _webout = 'Runner GET'
}

function defaultMethod() {
  _webout = 'Runner default'
}
