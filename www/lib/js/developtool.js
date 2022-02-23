$(function(){
	var $editor = $('#editor'),
		$output = $('#output'),
		$document = $(document);

	$('#userName').text(Cookies.get('USERNAME'));

	var editor = ace.edit("editor");
	editor.setTheme("ace/theme/monokai");
	editor.editSession = {};

	var resize = function() {
		var padding = $editor.parent().css('padding');

		$editor.css('bottom', Number.parseFloat(padding) + $output.height());
		$output.css('top', $editor.height());
		editor.resize();
	}
	resize();

	// output 클릭시 editor 높이 자동 조절
	(new MutationObserver(function(mutations) {
		resize();
	})).observe($output[0], {attributes: true, subtree:true});

	// window 크기 변경시 editor 높이 자동 조절
	$(window).resize(function() {
		resize();
	});

	$(document).on('keydown', function(e) {
		if ( !e.ctrlKey || e.which != 83) {
			return true;
		}

		$('#saveDocumentButton').trigger('click');

		e.preventDefault();
		return false;
	});


	var updateSolutionExplorer = function() {
		$.get("./solutionexplorer", function(data, status) {
			$('#left-charm ul>ul').empty().append(makeTree(data));

			function makeTree(root) {
				var code = "";
				for( var i=0; i<root.length; i++ ) {
					if( root[i].type == 'directory' ) {
						code += "<li class='node collapsed'>";
						code += "	<span class='leaf'>" + root[i].name + "</span>";
						code += "	<span class='node-toggle'></span>";
						code += "	<ul>" + makeTree(root[i].child) + "</ul>";
						code += "</li>";

					} else { 
						code += "<li><span data-type='file' class='leaf'>" + root[i].name + "</span></li>";
					}
				}

				return code;
			}
		});
	}
	updateSolutionExplorer();

	var setEditorSession = function(fileName) {
		editor.setSession(editor.editSession[fileName]);

		$('#tabs>li').removeClass();

		var $that = editor.editSession[fileName].that;
		$that.addClass('active');
		$that.addClass('tab-active');

		return true;
	}

	$document.on('click', '#tabs>li', function() {
		setEditorSession(this.textContent);

		return false;
	});

	$('#left-charm ul>ul').on('dblclick', '[data-type="file"]', function() {
		var pedigree = $.grep($(this).parentsUntil('#left-charm>div>ul>ul'), function(e) {
			return $(e).hasClass('node');
		});

		var solution = $(pedigree.pop()).children().first().text();
		var folder = "";

		for( var i=pedigree.length-1; i>-1; --i ) {
			folder += '/' + $(pedigree[i]).children().first().text();
		}

		$('#documentDialog').data('sendData', {solution:solution, folder:folder, fileName: $(this).text()});
		$('#loadDocumentButton').trigger('send');
	});

	$('.sidebar').on('click', 'li', function(){
		if (!$(this).hasClass('active')) {
			$('.sidebar li').removeClass('active');
			$(this).addClass('active');
		}
	});

	$('.sidebar-zone-in').on('mouseenter', function() {
		$("#left-charm").data("charm").open();
	});

	$('.sidebar-zone-out').on('mouseleave', function() {
		$("#left-charm").data("charm").close();
	});

	var trap = true;
	$('.heading', $output).on('mousedown', function(e) {
		if( e.which != 1 ) {
			return false;
		}
		trap = false;

		if( $output.hasClass('collapsed') ) {
			return false;
		}

		var lastY = e.clientY;
		$document.on('mousemove', function(e) {
			trap = true;

			var currY = e.clientY,
				deltaY = lastY - currY,
				height = $editor.height() - deltaY,
				content = $output.children('.content');

			if( (Number.parseFloat(content.css('height')) + deltaY) < Number.parseFloat(content.css('min-height')) && (height + $output.height()) > $output.parent().height() ) {
				return false;
			}

			content.height(content.height() + deltaY);
			resize();
			lastY = currY;
		});
	})
	$document.on('mouseup', function(e) {
		if( e.which != 1 ) {
			return false;
		}

		$document.off('mousemove');
		if( !trap ) {
			$('.heading', $output).trigger('controledEvent');
			trap = true;
		}
	});


	var eventMacro = function(id, event, type, callback) {
		$('#'+id).on(event, function() {
			var dialog = $('#documentDialog');
			$.ajax({
				url: $('#'+id).data('action'),
				type: type || 'get',
				data: dialog.data('sendData'),
				success: function(data) {
					callback(data);
				}
			});
		});
	}


	eventMacro('newDocumentButton', 'send', 'post', function(data) {
		updateSolutionExplorer();
		pushMessage(null, "Create New File: " + String(data));
	});

	eventMacro('saveAsButton', 'send', 'put', function(data) {
		updateSolutionExplorer();
		pushMessage(null, "Save File: " + String(data));
	});

	eventMacro('loadDocumentButton', 'send', 'get', function(data) {
		var splitedArry = data.split('?'),
			solution = splitedArry.shift(),
			folder = splitedArry.shift(),
			fileName = splitedArry.shift(),
			type = splitedArry.shift(),
			source = splitedArry.join('?'),
			fileInfo = {solution:solution, folder:folder, fileName:fileName, type:type};

		if( editor.editSession[fileName] ) {
			setEditorSession(fileName);
			editor.setValue(source);
		} else {
			$that = $("<li style='z-index:0'><a href='#'>" + fileName + "</a></li>");
			$('#tabs').append($that);

			var mode = 'ace/mode/' + (type == 'java' ? 'java' : 'c_cpp');
			editor.editSession[fileName] = ace.createEditSession(source, mode);
			editor.editSession[fileName].that = $that;
			editor.editSession[fileName].fileInfo = fileInfo;
			setEditorSession(fileName);
			editor.session.setMode(mode);
		}

		$('#tab').css('display', 'block');
		resize();
	});

	$('#compileSolutionButton').on('click', function() {
		$that = $('#tabs>li.active');
		if( !$that.length ) {
			return false;
		}

		var fileInfo = editor.editSession[$('#tabs>li.active').text()].fileInfo;
		var data = {
			solution: fileInfo.solution,
			folder: fileInfo.folder,
			fileName: fileInfo.fileName,
			type: $('.caption', $(':checked', $('#runConfigurationDialog')).parent()).text()
		}

		$('#documentDialog').data('sendData', JSON.stringify(data));
		$('#compileSolutionButton').trigger('send');
	});

	eventMacro('compileSolutionButton', 'send', 'put', function(data) {
		$('#compileLogger pre').text(data);

		var check;
		check = Boolean(data) == false ? false : true;
		pushMessage(null, "Compile Solution: " + String(check));
	});

	$('#runSolutionButton').on('click', function() {
		$that = $('#tabs>li.active');
		if( !$that.length ) {
			return false;
		}

		var fileInfo = editor.editSession[$('#tabs>li.active').text()].fileInfo;
		var url = './run/' + fileInfo.solution + '/' + fileInfo.fileName.substring(0, fileInfo.fileName.lastIndexOf('.')) + (fileInfo.type == 'java' ? '.class' : ($('.caption', $(':checked', $('#runConfigurationDialog')).parent()).text() == 'Windows' ? '.exe' : ''));
		$.get(url, function(data, status){
			$('#compileLogger pre').text(data);
			var check;
			check = Boolean(data) == false ? false : true;
			pushMessage(null, "Compile Solution: " + String(check));
		});
});

	$('#saveDocumentButton').on('click', function() {
		$that = $('#tabs>li.active');
		if( !$that.length ) {
			return false;
		}

		var fileInfo = editor.editSession[$('#tabs>li.active').text()].fileInfo;
		var source = editor.getValue();

		var data = {
			solution: fileInfo.solution,
			folder: fileInfo.folder,
			fileName: fileInfo.fileName,
			source: source
		}

		$.ajax({
			url: $(this).data('action'),
			type: 'put',
			data: JSON.stringify(data),
			success: function(data) {
				pushMessage(null, "Save File: " + String(data));
			}
		});
	});

	$('#newSolutionButton').on('click', function(){
		var window = $('#newSolutionWindow');

		$('#newSolutionName').val('');
		window.data('dialog').open();
	});


	$('#runConfigButton').on('click', function() {
		$('#runConfigurationDialog').data('dialog').open();
	});

	$('li#runconfig').click(function(){
		$.get("./run/runconfiguration",function(data,status){
			alert("Data: " + data + "\nStatus: " + status);
		});
	});


	var documentDialogMacro = function(id, header, placeholder) {
		$('#'+id).on('click', function() {
			$('#documentDialogOK').off('click');
			$('#documentDialogSolution').val('');
			$('#documentDialogFolder').val('');
			$('#documentDialogFileName').val('');

			$('#documentDialogHeader').text(header);
			$('#documentDialog').data('dialog').open();
			$('#documentDialogOK').one('click', function() {
				var sendData = {
					solution: $('#documentDialogSolution').val(),
					folder: $('#documentDialogFolder').val(),
					fileName: $('#documentDialogFileName').val(),
					source: editor.getValue()
				}

				if( id != "loadDocumentButton" ) {
					sendData = JSON.stringify(sendData);
				} 

				$('#documentDialog').data('sendData', sendData);
				$('#'+id).trigger('send');
				$('#documentDialog').data('dialog').close();
			});
		});
	}

	var searchDialogMacro = function(id, header, src) {
		$('#'+id).on('click', function() {
			$('#searchDialogHeader').text(header);
			$('#searchDialogText').val('');
			$('#searchDialog').data('dialog').open();
			$('#searchDialogOK').one('click', function() {
				window.open(src + $('#searchDialogText').val());
			});
		});
	}

	documentDialogMacro('newDocumentButton', "Create new Document");
	documentDialogMacro('loadDocumentButton', "Load Document");
	documentDialogMacro('saveAsButton', "Save as...");
	searchDialogMacro('searchGoogleButton', "Searching Google", "https://www.google.co.kr/search?q=");
	searchDialogMacro('searchMSDNButton', "Searching MSDN", "https://social.msdn.microsoft.com/Search/ko-KR?query=");
	

	$('#miniNewDocumentButton').on('click', function() {
		$('#newDocumentButton').trigger('click');
	});
	$('#miniSaveDocumentButton').on('click', function() {
		$('#saveDocumentButton').trigger('click');
	});
	$('#miniLoadDocumentButton').on('click', function() {
		$('#loadDocumentButton').trigger('click');
	});
	$('#miniCompileSolutionButton').on('click', function() {
		$('#compileSolutionButton').trigger('click');
	});
	$('#miniDownloadBinaryButton').on('click', function() {
		$('#downloadBinaryButton').trigger('click');
	});


	$('#newSolutionCloseButton').on('click', function() {
		var window = $('#newSolutionWindow');
		window.data('dialog').close();
		if( window.data('widget') ) {
			window.data('widget').step(1);
			window.data('widget')._step = 1;
		}
	});

	$('#newSolutionWindow').on('send', function() {
		$.post($('#newSolutionWindow').data('action'), JSON.stringify({solution:$('#newSolutionWindow').data('newSolutionName'), type:$('#newSolutionWindow').data('solutionType')}), function(data) {
			updateSolutionExplorer();
			pushMessage(null, "Create New Solution: " + String(data));
		});
	});

	eventMacro('logout', 'click', 'get', function() {
		sessionStorage['login'] = true;
		location.reload();
	});

	$('#downloadBinaryButton').on('click', function() {
		$that = $('#tabs>li.active');
		if( !$that.length ) {
			return false;
		}

		var fileInfo = editor.editSession[$('#tabs>li.active').text()].fileInfo;
		var url = './' + fileInfo.solution + '/.bin/' + fileInfo.fileName.substring(0, fileInfo.fileName.lastIndexOf('.')) + (fileInfo.type == 'java' ? '.class' : ($('.caption', $(':checked', $('#runConfigurationDialog')).parent()).text() == 'Windows' ? '.exe' : ''));
		location.href = url;
	});

	$('#developerInfoButton').on('click', function() {
		$('#developerInfoDialog').data('dialog').open();
	});
});
